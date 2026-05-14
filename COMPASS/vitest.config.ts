import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./test/setup.ts'],
        include: [
            'lib/**/__tests__/**/*.test.{ts,tsx}',
            'app/**/__tests__/**/*.test.{ts,tsx}',
            'components/**/__tests__/**/*.test.{ts,tsx}',
            'test/**/*.test.{ts,tsx}',
        ],
        exclude: [
            'node_modules/**',
            '.next/**',
            'e2e/**',
            'playwright-report/**',
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json-summary', 'lcov'],
            include: ['lib/**/*.ts', 'app/api/**/*.ts'],
            exclude: [
                'lib/**/*.d.ts',
                'lib/supabase/mock-client.ts',
                'lib/**/__tests__/**',
                'app/api/**/__tests__/**',
            ],
            thresholds: {
                lines: 80,
                functions: 80,
                statements: 80,
                branches: 75,
            },
        },
        clearMocks: true,
        testTimeout: 10_000,
        hookTimeout: 10_000,
    },
})
