import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase/mock-client'
import { ARCHIVED_ACCOUNT_ERROR_CODE, isArchivedAccount } from '@/lib/auth/employment-access'

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
        const isPublicPath = pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname.startsWith('/forgot-password') || pathname.startsWith('/privacy-policy') || pathname.startsWith('/terms') || pathname.startsWith('/help') || pathname.startsWith('/survey/consultant-pulse')
        const onboardingDone = request.cookies.get('onboarding_done')?.value === 'true'

        // Single profile fetch — wcześniej były 2 osobne SELECT-y dla /internal guard
        // i onboarding gate. Łączymy w jeden żeby zmniejszyć latency edge.
        //
        // Zakres rozszerzony z listy ścieżek na "każda niepubliczna": blokada
        // zarchiwizowanych kont niżej musi działać WSZĘDZIE, a nie tylko tam,
        // gdzie akurat potrzebowaliśmy roli (/messages, /profile, /documents
        // wcześniej ten SELECT pomijały). Koszt to jeden lookup po PK na tych
        // ścieżkach — cena za to, żeby blokada nie miała dziur.
        const needsProfile = !isPublicPath

        let role: string | undefined
        let onboardingCompleted: boolean | undefined
        let employmentStatus: string | undefined
        if (needsProfile) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role, onboarding_completed, employment_status')
                .eq('id', user.id)
                .single()
            role = profile?.role as string | undefined
            onboardingCompleted = profile?.onboarding_completed as boolean | undefined
            employmentStatus = profile?.employment_status as string | undefined
        }

        // Zarchiwizowany pracownik traci dostęp natychmiast — także z sesją,
        // którą miał otwartą w chwili archiwizacji. To jedyna warstwa, przez
        // którą przechodzą też server actions (POST na ścieżkę strony), więc
        // stara karta w przeglądarce nie może dalej wołać akcji.
        //
        // Wylogowanie jest best-effort: gdyby signOut padł, blokada i tak
        // trzyma, bo middleware liczy ją przy KAŻDYM żądaniu.
        if (isArchivedAccount(employmentStatus)) {
            try {
                await supabase.auth.signOut()
            } catch {
                // Sesja i tak jest martwa z punktu widzenia aplikacji.
            }
            const loginUrl = new URL('/login', request.url)
            loginUrl.searchParams.set('error', ARCHIVED_ACCOUNT_ERROR_CODE)
            const archivedResponse = NextResponse.redirect(loginUrl)
            // signOut czyści ciasteczka przez setAll na `response`; przenosimy je
            // na odpowiedź przekierowującą, bo to ona wraca do przeglądarki.
            response.cookies.getAll().forEach((cookie) => archivedResponse.cookies.set(cookie))
            return archivedResponse
        }

        // Phase 20: HR-zone roles (everyone EXCEPT consultant IT).
        const HR_ZONE_ROLES = ['admin', 'internal', 'finanse', 'manager', 'talent_community']
        const isHrZoneUser = role !== undefined && HR_ZONE_ROLES.includes(role)
        // Roles that land on /internal (no platform features). Admin keeps full access.
        const INTERNAL_LANDING_ROLES = ['internal', 'finanse', 'manager', 'talent_community']
        const isInternalLanding = role !== undefined && INTERNAL_LANDING_ROLES.includes(role)
        // Admin OR Talent Community Manager — handles inbox, compliance, news composer.
        const isAdminOrTcm = role === 'admin' || role === 'talent_community'

        // Security defense-in-depth: gate /internal/* at the edge — HR-zone roles only.
        // Bez tego layout (app/(protected)/internal/layout.tsx) jest sole guard, a bare
        // route handlers pod /internal mogłyby leakować HR data do konsultanta.
        // Phase 19a (2026-05-14): added 'finanse'. Phase 20 (2026-05-16): added manager + talent_community.
        if (pathname.startsWith('/internal')) {
            if (!isHrZoneUser) {
                return NextResponse.redirect(new URL('/home', request.url))
            }
        }

        // Phase 20: /admin/inbox + /admin/compliance + /admin/news — admin OR Talent Community Manager.
        // Pozostałe /admin/* (np. /admin/users) zostają admin-only — layout enforced separately.
        if (
            pathname.startsWith('/admin/inbox') ||
            pathname.startsWith('/admin/compliance') ||
            pathname.startsWith('/admin/news')
        ) {
            if (!isAdminOrTcm) {
                return NextResponse.redirect(new URL(isHrZoneUser ? '/internal' : '/home', request.url))
            }
        }

        // Phase 20: pracownicy biurowi NIE widzą /home, /learning, /league (consultant IT + admin only).
        // Aktualności (/news), Inkubator (/incubator), Support (/support) są WSPÓLNE dla wszystkich
        // HR-zone ról — nie redirectujemy z nich.
        if (isInternalLanding) {
            const platformOnlyPaths = ['/home', '/learning', '/league']
            if (platformOnlyPaths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
                return NextResponse.redirect(new URL('/internal', request.url))
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
