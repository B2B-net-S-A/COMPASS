import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase/mock-client'

export async function middleware(request: NextRequest) {
    const response = NextResponse.next({
        request: { headers: request.headers },
    })

    if (!isSupabaseConfigured()) {
        return response
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // SECURITY: Emergency bypass via 'emergency_auth_user' cookie removed (was a security risk in production).
    // All users must authenticate through Supabase auth.

    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        const pathname = request.nextUrl.pathname
        const isOnboarding = pathname.startsWith('/onboarding')
        const isConsent = pathname.startsWith('/consent')
        const isPublicPath = pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname.startsWith('/forgot-password') || pathname.startsWith('/privacy-policy') || pathname.startsWith('/terms') || pathname.startsWith('/help') || pathname.startsWith('/support')
        const isDocsPath = pathname.startsWith('/docs/')
        const onboardingDone = request.cookies.get('onboarding_done')?.value === 'true'
        const consentDone = request.cookies.get('consent_accepted')?.value === 'true'

        if (!isPublicPath && !isOnboarding && !onboardingDone) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role, onboarding_completed')
                .eq('id', user.id)
                .single()

            if (profile?.role === 'consultant' && !profile?.onboarding_completed) {
                const redirectUrl = new URL('/onboarding', request.url)
                return NextResponse.redirect(redirectUrl)
            } else if (profile?.onboarding_completed || profile?.role !== 'consultant') {
                response.cookies.set('onboarding_done', 'true', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    path: '/',
                    maxAge: 60 * 60 * 24 * 30,
                })
            }
        }

        // Consent gate: redirect to /consent if user hasn't accepted current terms version
        // Allow access to /consent itself, /docs/* (to read documents), and public/onboarding paths
        if (!isPublicPath && !isConsent && !isOnboarding && !isDocsPath && !consentDone) {
            // Check consent in DB via lightweight query
            const { data: consent } = await supabase
                .from('um_user_consents')
                .select('id')
                .eq('user_id', user.id)
                .eq('terms_version', '1.0')
                .eq('accepted_terms', true)
                .eq('accepted_privacy', true)
                .eq('accepted_data_processing', true)
                .eq('accepted_ai', true)
                .limit(1)
                .maybeSingle()

            if (consent) {
                // Set cookie to avoid DB check on every request
                response.cookies.set('consent_accepted', 'true', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    path: '/',
                    maxAge: 60 * 60 * 24 * 30, // 30 days
                })
            } else {
                const redirectUrl = new URL('/consent', request.url)
                return NextResponse.redirect(redirectUrl)
            }
        }
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
    ],
}
