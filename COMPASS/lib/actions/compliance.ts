'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { CURRENT_TERMS_VERSION } from '@/lib/constants/compliance'
import { getFallbackDoc } from '@/lib/constants/fallback-docs'
import { headers } from 'next/headers'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UserConsent {
  id: string
  user_id: string
  accepted_terms: boolean
  accepted_privacy: boolean
  accepted_data_processing: boolean
  accepted_ai: boolean
  terms_version: string
  accepted_at: string
  accepted_ip: string | null
  accepted_ua: string | null
}

export interface LegalDocument {
  id: string
  slug: string
  title: string
  content_html: string
  version: string
  is_active: boolean
  requires_acceptance: boolean
  visibility: 'public' | 'authenticated' | 'admin'
  created_at: string
  updated_at: string
}

// ─── Check User Consents ───────────────────────────────────────────────────────

/**
 * Check whether the current user has accepted the current terms version.
 * Returns the latest consent record or null if re-acceptance is needed.
 */
export async function checkUserConsents(): Promise<UserConsent | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('um_user_consents')
    .select('*')
    .eq('user_id', user.id)
    .eq('terms_version', CURRENT_TERMS_VERSION)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  // Check all required consents are true
  const consent = data as UserConsent
  if (
    consent.accepted_terms &&
    consent.accepted_privacy &&
    consent.accepted_data_processing &&
    consent.accepted_ai
  ) {
    return consent
  }

  return null
}

// ─── Save User Consents ────────────────────────────────────────────────────────

export interface SaveConsentsInput {
  accepted_terms: boolean
  accepted_privacy: boolean
  accepted_data_processing: boolean
  accepted_ai: boolean
}

/**
 * Save user consent record with IP + User-Agent for audit trail.
 */
export async function saveUserConsents(input: SaveConsentsInput): Promise<{ error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nie jesteś zalogowany.' }

  // All checkboxes must be true
  if (!input.accepted_terms || !input.accepted_privacy || !input.accepted_data_processing || !input.accepted_ai) {
    return { error: 'Wszystkie zgody są wymagane.' }
  }

  // Get IP and User-Agent from request headers
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || headersList.get('x-real-ip') || null
  const ua = headersList.get('user-agent') || null

  const { error } = await supabase.from('um_user_consents').insert({
    user_id: user.id,
    accepted_terms: input.accepted_terms,
    accepted_privacy: input.accepted_privacy,
    accepted_data_processing: input.accepted_data_processing,
    accepted_ai: input.accepted_ai,
    terms_version: CURRENT_TERMS_VERSION,
    accepted_ip: ip,
    accepted_ua: ua,
  })

  if (error) {
    logCompat.error('[saveUserConsents]', error)
    return { error: 'Błąd zapisu zgód. Spróbuj ponownie.' }
  }

  return {}
}

// ─── Get Legal Document ────────────────────────────────────────────────────────

/**
 * Compatibility layer: prod schema uses `document_type` (enum-constrained) +
 * `content` columns. Newer code expects `slug` + `content_html`. We map between
 * them here so callers don't have to know.
 */
const SLUG_TO_DOC_TYPE: Record<string, string> = {
  'privacy-policy': 'privacy_policy',
  'terms': 'terms_of_service',
  'help': 'help_center',                // not yet allowed by CHECK constraint — falls through to null
  'ai-notice': 'ai_notice',
  'security': 'security',
  'cooperation': 'cooperation',
  'electronic-signature': 'electronic_signature',
  'access-management': 'access_management',
  'incident-response': 'incident_response',
  'data-retention': 'data_retention',
}

interface LegalDocumentRow {
  id?: string
  slug?: string
  document_type?: string
  title: string
  content_html?: string
  content?: string
  version: string
  is_active: boolean
  requires_acceptance?: boolean
  visibility?: 'public' | 'authenticated' | 'admin'
  created_at: string
  updated_at: string
}

function normaliseDoc(row: LegalDocumentRow | null): LegalDocument | null {
  if (!row) return null
  return {
    id: row.id ?? '',
    slug: row.slug ?? row.document_type ?? '',
    title: row.title,
    content_html: row.content_html ?? row.content ?? '',
    version: row.version,
    is_active: row.is_active,
    requires_acceptance: row.requires_acceptance ?? false,
    visibility: row.visibility ?? 'public',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Fetch a single legal document by its slug.
 * Tries the newer `slug` + `content_html` schema first; falls back to the prod
 * `document_type` + `content` schema with a friendly slug → enum mapping.
 */
export async function getLegalDocument(slug: string): Promise<LegalDocument | null> {
  const supabase = createClient()

  // Primary: try `slug` column (newer schema)
  const slugAttempt = await supabase
    .from('um_legal_documents')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!slugAttempt.error && slugAttempt.data) {
    return normaliseDoc(slugAttempt.data as LegalDocumentRow)
  }

  // Fallback 1: try `document_type` (older / prod schema)
  const docType = SLUG_TO_DOC_TYPE[slug] ?? slug
  const typeAttempt = await supabase
    .from('um_legal_documents')
    .select('*')
    .eq('document_type', docType)
    .eq('is_active', true)
    .maybeSingle()

  const dbResult = normaliseDoc((typeAttempt.data as LegalDocumentRow | null) ?? null)
  if (dbResult) return dbResult

  // Fallback 2: bundled fallback content (for slugs blocked by prod CHECK constraint
  // — e.g. help, ai-notice, security, cooperation, electronic-signature, access-management,
  // incident-response, data-retention).
  const bundled = getFallbackDoc(slug)
  if (bundled) {
    const now = new Date().toISOString()
    return {
      id: `fallback-${slug}`,
      slug,
      title: bundled.title,
      content_html: bundled.content_html,
      version: bundled.version,
      is_active: true,
      requires_acceptance: false,
      visibility: 'public',
      created_at: now,
      updated_at: now,
    }
  }

  return null
}

// ─── List Legal Documents ──────────────────────────────────────────────────────

/**
 * List all active legal documents visible to the current user.
 * If visibility filter is provided, only those docs are returned.
 * Compatible with both `slug`-style and `document_type`-style schemas.
 */
export async function listLegalDocuments(
  visibility?: 'public' | 'authenticated' | 'admin'
): Promise<LegalDocument[]> {
  const supabase = createClient()

  let query = supabase
    .from('um_legal_documents')
    .select('*')
    .eq('is_active', true)
    .order('title')

  // visibility column may not exist in legacy schema — only apply if asked,
  // and gracefully fall back if the column is missing.
  if (visibility) {
    query = query.eq('visibility', visibility)
  }

  const { data, error } = await query
  if (error && /visibility/.test(error.message ?? '')) {
    // legacy schema without visibility — re-run unfiltered
    const { data: data2 } = await supabase
      .from('um_legal_documents')
      .select('*')
      .eq('is_active', true)
      .order('title')
    return ((data2 as LegalDocumentRow[]) || []).map(d => normaliseDoc(d)).filter((d): d is LegalDocument => d !== null)
  }

  return ((data as LegalDocumentRow[]) || []).map(d => normaliseDoc(d)).filter((d): d is LegalDocument => d !== null)
}

// ─── Admin: List All Consents ──────────────────────────────────────────────────

export interface ConsentWithUser extends UserConsent {
  user_email?: string
}

/**
 * Admin-only: list all consent records (for audit).
 */
export async function listAllConsents(limit = 100): Promise<ConsentWithUser[]> {
  const supabase = createClient()

  const { data } = await supabase
    .from('um_user_consents')
    .select('*')
    .order('accepted_at', { ascending: false })
    .limit(limit)

  return (data as ConsentWithUser[]) || []
}
