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
            clean: true,
            reportsDirectory: 'coverage',
            reporter: ['text', 'lcov'],
            // Vitest 4 includes untested files matched by `include` whenever
            // the complete suite runs. Keeping every application source root
            // explicit makes missing changed files fail closed in the shared
            // LCOV checker without relying on the removed `coverage.all` flag.
            include: [
                'app/**/*.{js,jsx,ts,tsx}',
                'components/**/*.{js,jsx,ts,tsx}',
                'lib/**/*.{js,jsx,ts,tsx}',
            ],
            exclude: [
                '**/*.config.{js,ts}',
                '**/*.d.ts',
                '**/*.test.{js,jsx,ts,tsx}',
                '**/__tests__/**',
                'lib/supabase/database.types.ts',
                'lib/supabase/mock-client.ts',
            ],
        },
        clearMocks: true,
        testTimeout: 10_000,
        hookTimeout: 10_000,
    },
})
