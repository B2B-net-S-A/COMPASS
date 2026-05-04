/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
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

export default nextConfig;
