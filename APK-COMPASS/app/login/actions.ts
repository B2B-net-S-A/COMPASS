'use server'


import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

import { logLoginAttempt } from '@/lib/auth/security'
import { logAudit } from '@/lib/actions/audit'
import { verifyMFACode } from '@/lib/mfa'
import { cookies } from 'next/headers'

import { isSupabaseConfigured } from '@/lib/supabase/mock-client'
import { syncRole } from '@/lib/auth/sync-role'

// ─── Friendly Error Messages ────────────────────────────────────────────────
// Maps raw Supabase/system errors to user-friendly Polish messages
// ─────────────────────────────────────────────────────────────────────────────

function friendlyLoginError(raw: string): string {
    const msg = raw.toLowerCase()
    if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
        return 'Nieprawidłowy email lub hasło. Sprawdź dane i spróbuj ponownie.'
    }
    if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
        return 'Twoje konto czeka na aktywację. Sprawdź skrzynkę pocztową — wysłaliśmy Ci link potwierdzający.'
    }
    if (msg.includes('too many requests') || msg.includes('rate_limit')) {
        return 'Zbyt wiele prób logowania. Odpocznij chwilę i spróbuj ponownie za kilka minut.'
    }
    if (msg.includes('user not found') || msg.includes('no user found')) {
        return 'Nie znaleziono konta z takim adresem email. Sprawdź, czy nie ma literówki.'
    }
    if (msg.includes('network') || msg.includes('fetch')) {
        return 'Problem z połączeniem. Sprawdź internet i spróbuj ponownie.'
    }
    if (msg.includes('user already registered')) {
        return 'Konto z tym adresem email już istnieje. Spróbuj się zalogować.'
    }
    // Fallback — still Polish, but includes original for debugging
    return `Wystąpił problem z logowaniem. Spróbuj ponownie za chwilę.`
}

function friendlySignupError(raw: string, err?: { code?: string }): string {
    const msg = raw.toLowerCase()
    const code = err?.code?.toLowerCase() ?? ''

    // Konto już istnieje — wszystkie warianty z Supabase / GoTrue
    const alreadyExists =
        code === 'user_already_exists' ||
        code.includes('already_exists') ||
        msg.includes('user already registered') ||
        msg.includes('already registered') ||
        msg.includes('email already exists') ||
        msg.includes('already exists') ||
        msg.includes('user already exists') ||
        msg.includes('duplicate') ||
        msg.includes('zarejestrowany') ||
        msg.includes('już istnieje')
    if (alreadyExists) {
        return 'Konto z tym adresem email już istnieje. Spróbuj się zalogować.'
    }

    if (msg.includes('password') && msg.includes('weak')) {
        return 'Hasło jest za słabe. Użyj min. 10 znaków, wielkiej litery i cyfry.'
    }
    if (msg.includes('rate_limit') || msg.includes('rate limit') || msg.includes('too many requests') || code.includes('rate_limit') || code.includes('over_email_send_rate_limit') || msg.includes('email rate limit')) {
        return 'Przekroczono limit wysyłania emaili. Poczekaj kilka minut i spróbuj ponownie, lub skontaktuj się z administratorem.'
    }
    if (msg.includes('signup is disabled') || msg.includes('signups not allowed')) {
        return 'Rejestracja jest tymczasowo wyłączona. Skontaktuj się z administratorem.'
    }
    // Fallback — include sanitized original for debugging
    console.error('[SIGNUP_FALLBACK_ERROR]', raw, code)
    return `Wystąpił problem z rejestracją. Spróbuj ponownie za chwilę.`
}

const BYPASS_EMAIL = process.env.BYPASS_EMAIL?.toLowerCase() ?? ''

export async function login(formData: FormData) {
    const email = (formData.get('email') as string)?.trim()?.toLowerCase()
    const password = formData.get('password') as string

    if (!email || !password) {
        return { error: 'Proszę podać email i hasło' }
    }

    // Bypass logowania — wyłączony w produkcji niezależnie od ALLOW_BYPASS_LOGIN
    const bypassAllowed = process.env.NODE_ENV !== 'production'
        && (!isSupabaseConfigured() || process.env.ALLOW_BYPASS_LOGIN === 'true')
    if (BYPASS_EMAIL && email === BYPASS_EMAIL && bypassAllowed) {
        const cookieStore = cookies()
        cookieStore.set('emergency_auth_user', BYPASS_EMAIL, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 7 dni
        })
        cookieStore.set('mfa_verified', 'true', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24,
        })
        redirect('/home')
    }

    const supabase = createClient()

    // 1. Sign in
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        console.error('[LOGIN_DEBUG] Auth error:', error)
        return { error: friendlyLoginError(error.message) }
    }

    // 2. Get user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Błąd sesji. Spróbuj ponownie.' }
    }

    // 3. Get current profile role + onboarding status
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, onboarding_completed')
        .eq('id', user.id)
        .single()

    const currentRole = profile?.role || 'consultant'

    // 4. Sync role from access lists (single source of truth)
    const role = await syncRole(supabase, user.id, email, currentRole)

    // 5a. Set onboarding cookie
    if (profile?.onboarding_completed || role !== 'consultant') {
        cookies().set('onboarding_done', 'true', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
        })
    }

    // 5b. Set MFA cookie for admin/centrala roles
    if (role === 'admin') {
        cookies().set('mfa_verified', 'true', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 // 24 hours
        })
    }

    redirect('/home')
}

export async function verifyMfaAction(userId: string, code: string) {
    const result = await verifyMFACode(userId, code)
    if (result.error) {
        return { error: result.error }
    }

    // Set cookie to remember MFA verification for this session
    // We use a simple cookie strictly for the middleware/layout check
    cookies().set('mfa_verified', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 30 // 30 minutes session per spec
    })

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await logLoginAttempt(user?.email || 'unknown', true)
    await logAudit(userId, 'LOGIN', { method: 'MFA' })

    // Redirect based on role (we need to fetch role again or pass it)
    // For safety, fetch again
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
    const role = profile?.role

    if (role === 'consultant') {
        redirect('/home')
    } else {
        redirect('/home')
    }
}

export async function signup(formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const fullName = formData.get('fullName') as string

    if (!email || !password || !fullName) {
        return { error: 'Wszystkie pola są wymagane' }
    }

    // 1. Domain Validation
    if (!email.toLowerCase().endsWith('@b2bnetwork.pl')) {
        return { error: 'Rejestracja dozwolona tylko dla domeny @b2bnetwork.pl' }
    }

    // 2. Password Strength Validation
    // Min 10 chars, 1 Uppercase, 1 Digit
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{10,}$/
    if (!passwordRegex.test(password)) {
        return { error: 'Hasło musi mieć min. 10 znaków, zawierać wielką literę i cyfrę.' }
    }

    // 3. GDPR Consent Validation
    // Assuming formData has 'gdpr_consent'
    // Actually, for consistency with the new flow, we might require it here OR in onboarding.
    // Spec says: "Obowiazkowa akceptacja klauzuli RODO pri rejestracji" for Consultant.
    // So we should expect it in formData.
    const gdprConsent = formData.get('gdpr_consent') === 'on'
    if (!gdprConsent) {
        return { error: 'Wymagana zgoda RODO.' }
    }

    const supabase = createClient()

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:10000'

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName.trim(),
                gdpr_consent: true,
                role: 'consultant',
            },
            emailRedirectTo: `${siteUrl}/auth/callback`,
        },
    })

    if (error) {
        // Log pełnej odpowiedzi, żeby w razie problemu widzieć dokładny komunikat/code z Supabase
        console.error('[SIGNUP_DEBUG]', { message: error.message, code: (error as { code?: string }).code })
        return { error: friendlySignupError(error.message, error as { code?: string }) }
    }

    // Supabase przy włączonym "Confirm email" często nie zwraca błędu, tylko sukces z pustą tablicą identities
    const identities = data?.user?.identities
    if (data?.user && (identities == null || (Array.isArray(identities) && identities.length === 0))) {
        return { error: 'Konto z tym adresem email już istnieje. Spróbuj się zalogować.' }
    }

    return { success: 'Rejestracja zakończona sukcesem! Możesz się teraz zalogować.' }
}

// ─── Microsoft 365 SSO (Azure Entra) ─────────────────────────────────────────
// Tenant: b2bnetwork.pl. Single-tenant Azure app + post-callback domain check
// in app/auth/callback/route.ts as defense-in-depth.

export async function signInWithMicrosoft() {
    const supabase = createClient()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
        || process.env.NEXT_PUBLIC_APP_URL
        || 'http://localhost:10000'

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
            scopes: 'email openid profile',
            redirectTo: `${siteUrl}/auth/callback`,
        },
    })

    if (error || !data?.url) {
        console.error('[SSO_AZURE] signInWithOAuth failed:', error?.message)
        return { error: 'Nie udało się rozpocząć logowania przez Microsoft. Spróbuj ponownie lub użyj email + hasło.' }
    }

    redirect(data.url)
}
