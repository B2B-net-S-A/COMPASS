import { withSentryConfig } from '@sentry/nextjs'

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
    // Hide .map files from prod assets (uploaded to Sentry only).
    hideSourceMaps: true,
    // Disable Sentry SDK's own logger to avoid console noise.
    disableLogger: true,
    // Auth token for source maps upload — Coolify provides at build time.
    authToken: process.env.SENTRY_AUTH_TOKEN,
    // Skip upload entirely if no auth token (still wraps for runtime hooks).
    sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
    },
    // Resilience: Sentry release create/upload occasionally returns 5xx
    // (504 gateway timeout — `sentry-cli releases new` then aborts the
    // whole `next build`). Source maps are a nice-to-have for debugging,
    // not a release blocker. Log + continue instead of failing the build.
    errorHandler: (err) => {
        console.warn('[sentry] non-fatal source-map upload error:', err.message);
    },
});
