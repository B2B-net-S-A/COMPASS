import { withSentryConfig } from '@sentry/nextjs'


// ─── Content-Security-Policy (audyt 2026-08, C8) ────────────────────────────
// Dyrektywy, których włączenie jest bezpieczne od ręki: żadna nie dotyka
// skryptów, stylów ani połączeń sieciowych, więc nie ma czego zepsuć.
const ENFORCED_CSP = [
    "base-uri 'self'",        // blokuje wstrzyknięcie <base> przekierowującego zasoby
    "object-src 'none'",      // <object>/<embed> — wektor legacy, aplikacja ich nie używa
    "frame-ancestors 'none'", // clickjacking; dubluje X-Frame-Options dla nowszych przeglądarek
].join('; ');

// Pełna polityka — na razie TYLKO raportowana.
// Uwagi do zawartości:
//  • 'unsafe-inline' i 'unsafe-eval' w script-src są wymagane przez bootstrap
//    hydratacji Next 14; zdjęcie ich wymaga nonce'ów, czyli osobnej pracy.
//  • connect-src musi obejmować Supabase (REST + realtime po WSS) i Sentry,
//    inaczej zniknie zapis danych i raportowanie błędów.
//  • Microsoft w form-action/frame-src — logowanie SSO przechodzi przez login.microsoftonline.com.
const REPORT_ONLY_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.microsoft.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://login.microsoftonline.com",
    "frame-src 'self' https://login.microsoftonline.com",
    "form-action 'self' https://login.microsoftonline.com",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    // Type-check + lint są bramkowane w CI ("Typecheck + Lint + Test + Build").
    // Pomijamy je w `next build`, bo faza "Linting and checking validity of types"
    // jest pamięciożerna i OOM-uje na build-hoście (Hetzner CAX21 ARM, 0 swap),
    // przez co `docker compose build` wywala się exit 255 mimo udanej kompilacji.
    eslint: { ignoreDuringBuilds: true },
    typescript: { ignoreBuildErrors: true },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'txzflesacqvlyhxwfjxk.supabase.co',
                port: '',
                pathname: '/storage/v1/object/public/**',
            },
        ],
    },
    compress: true,
    swcMinify: true,
    experimental: {
        serverComponentsExternalPackages: ['pg'],
        optimizePackageImports: [
            'lucide-react',
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-avatar',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-switch',
            '@radix-ui/react-label',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            'date-fns',
            'sonner',
        ],
    },
    // Phase 0+1 (2026-05-04): IA refactor redirects.
    // Phase 1.3 added /akademia/* → /learning/* after the folder rename.
    async redirects() {
        return [
            { source: '/dashboard', destination: '/home', permanent: false },
            { source: '/development', destination: '/learning', permanent: false },
            { source: '/akademia', destination: '/learning', permanent: false },
            { source: '/akademia/:path*', destination: '/learning/:path*', permanent: false },
            { source: '/admin/akademia', destination: '/admin/learning', permanent: false },
            { source: '/admin/akademia/:path*', destination: '/admin/learning/:path*', permanent: false },
            // Phase 2 (2026-05-04): /loyalty → /league rename
            { source: '/loyalty', destination: '/league', permanent: false },
            { source: '/loyalty/:path*', destination: '/league/:path*', permanent: false },
            { source: '/admin/settings/loyalty', destination: '/admin/settings', permanent: false },
            // Consultant Success: resolve legacy contractor deep links before
            // protected layouts render. A nested server-component redirect can
            // otherwise be replaced by the layout's auth fallback during RSC
            // navigation, sending an authenticated TCM to /login.
            {
                source: '/internal/kontraktorzy/:id',
                destination: '/internal/people/success/consultants/:id',
                permanent: false,
            },
        ]
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                    // Audyt 2026-08 (C8): brakowało Content-Security-Policy — grep za
                    // „content-security-policy" po całym repo dawał 0 trafień.
                    //
                    // Wdrożenie jest DWUSTOPNIOWE, bo nie ma środowiska stagingowego:
                    // pełna CSP puszczona na ślepo dla 46 osób potrafi wyłączyć
                    // aplikację, a błąd wyszedłby dopiero u użytkownika.
                    //
                    // 1) EGZEKWOWANA jest tylko część, która nie może niczego zepsuć:
                    //    nic tu nie ogranicza skryptów, stylów ani połączeń.
                    { key: 'Content-Security-Policy', value: ENFORCED_CSP },
                    // 2) RAPORTUJĄCA niesie pełną politykę — przeglądarka zgłasza,
                    //    co BY zablokowała, ale niczego nie blokuje. Po tygodniu bez
                    //    naruszeń przenieś jej treść do nagłówka egzekwowanego.
                    { key: 'Content-Security-Policy-Report-Only', value: REPORT_ONLY_CSP },
                ],
            },
        ];
    },
};

// Wrap with Sentry's webpack plugin. Source maps upload only runs when
// SENTRY_AUTH_TOKEN is provided at build time (Coolify env vault, buildtime=true).
// Without the token the wrapper is a no-op for upload but still injects the
// Sentry instrumentation hooks needed for releases + breadcrumbs.
export default withSentryConfig(nextConfig, {
    org: 'b2bnet-sa',
    project: 'compass',
    // Suppress logs locally; let CI logs surface them.
    silent: !process.env.CI,
    // Disable Sentry SDK's own logger to avoid console noise.
    // (SDK 10: `disableLogger` przeniesione tutaj i deprecated na starym miejscu.)
    webpack: {
        treeshake: { removeDebugLogging: true },
    },
    // Auth token for source maps upload — Coolify provides at build time.
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sourcemaps: {
        // Skip upload entirely if no auth token (still wraps for runtime hooks).
        disable: !process.env.SENTRY_AUTH_TOKEN,
        // Zastępuje `hideSourceMaps: true` z SDK 8 (opcja zniknęła w 9/10).
        // Cel ten sam: .map powstają na czas builda, lecą do Sentry i znikają
        // z artefaktu — nikt nie pobierze źródeł z produkcji. To jest domyślne
        // zachowanie w 10.x, ustawione jawnie, żeby zmiana domyślnej wartości
        // po stronie SDK nie wystawiła map po cichu.
        deleteSourcemapsAfterUpload: true,
    },
    // Resilience: Sentry release create/upload occasionally returns 5xx
    // (504 gateway timeout — `sentry-cli releases new` then aborts the
    // whole `next build`). Source maps are a nice-to-have for debugging,
    // not a release blocker. Log + continue instead of failing the build.
    errorHandler: (err) => {
        console.warn('[sentry] non-fatal source-map upload error:', err.message);
    },
});
