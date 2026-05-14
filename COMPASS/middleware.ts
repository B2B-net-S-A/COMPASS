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
        const isPublicPath = pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname.startsWith('/forgot-password') || pathname.startsWith('/privacy-policy') || pathname.startsWith('/terms') || pathname.startsWith('/help')
        const onboardingDone = request.cookies.get('onboarding_done')?.value === 'true'

        // Single profile fetch — wcześniej były 2 osobne SELECT-y dla /internal guard
        // i onboarding gate. Łączymy w jeden żeby zmniejszyć latency edge.
        const needsProfile = pathname.startsWith('/internal')
            || pathname === '/home'
            || pathname.startsWith('/learning')
            || pathname.startsWith('/league')
            || pathname.startsWith('/incubator')
            || pathname.startsWith('/news')
            || pathname.startsWith('/support')
            || (!isPublicPath && !isOnboarding && !onboardingDone)

        let role: string | undefined
        let onboardingCompleted: boolean | undefined
        if (needsProfile) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role, onboarding_completed')
                .eq('id', user.id)
                .single()
            role = profile?.role as string | undefined
            onboardingCompleted = profile?.onboarding_completed as boolean | undefined
        }

        // Security defense-in-depth: gate /internal/* at the edge — admin + internal + finanse only.
        // Bez tego layout (app/(protected)/internal/layout.tsx) jest sole guard, a bare
        // route handlers pod /internal mogłyby leakować HR data do konsultanta.
        // Phase 19a (2026-05-14): added 'finanse' role for invoice review access.
        if (pathname.startsWith('/internal')) {
            if (role !== 'admin' && role !== 'internal' && role !== 'finanse') {
                return NextResponse.redirect(new URL('/home', request.url))
            }
        }

        // Konsultant biurowy (role='internal') i Finanse NIE widzą platform features.
        // Inverse guard po /internal check (admin nadal przechodzi do /home/learning/etc).
        if (role === 'internal' || role === 'finanse') {
            const platformPaths = ['/home', '/learning', '/league', '/incubator', '/news', '/support']
            if (platformPaths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
                // Finanse landing → /internal/admin?tab=invoices, internal → /internal
                const landing = role === 'finanse' ? '/internal/admin?tab=invoices' : '/internal'
                return NextResponse.redirect(new URL(landing, request.url))
            }
        }

        if (!isPublicPath && !isOnboarding && !onboardingDone) {
            if (role === 'consultant' && !onboardingCompleted) {
                const redirectUrl = new URL('/onboarding', request.url)
                return NextResponse.redirect(redirectUrl)
            } else if (onboardingCompleted || role !== 'consultant') {
                response.cookies.set('onboarding_done', 'true', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    path: '/',
                    maxAge: 60 * 60 * 24 * 30,
                })
            }
        }

        // Consent gate disabled — page at /consent remains accessible but is no longer enforced.
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
