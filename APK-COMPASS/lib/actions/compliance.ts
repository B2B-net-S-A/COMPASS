'use server'

import { createClient } from '@/lib/supabase/server'
import { CURRENT_TERMS_VERSION } from '@/lib/constants/compliance'
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
  const headersList = headers()
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
    console.error('[saveUserConsents]', error)
    return { error: 'Błąd zapisu zgód. Spróbuj ponownie.' }
  }

  return {}
}

// ─── Get Legal Document ────────────────────────────────────────────────────────

/**
 * Fetch a single legal document by its slug.
 * Respects RLS — only returns documents the user has access to.
 */
export async function getLegalDocument(slug: string): Promise<LegalDocument | null> {
  const supabase = createClient()

  const { data } = await supabase
    .from('um_legal_documents')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  return (data as LegalDocument) || null
}

// ─── List Legal Documents ──────────────────────────────────────────────────────

/**
 * List all active legal documents visible to the current user.
 * If visibility filter is provided, only those docs are returned.
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

  if (visibility) {
    query = query.eq('visibility', visibility)
  }

  const { data } = await query

  return (data as LegalDocument[]) || []
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
