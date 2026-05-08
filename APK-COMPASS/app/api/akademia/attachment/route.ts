import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

/**
 * Pobiera załącznik PDF z bucketu `documents` (path zaczyna się od `courses/`)
 * i streamuje do klienta. Wymaga autentykacji.
 *
 * Strategia auth: użytkownik musi być zalogowany. Walidacja "czy ma dostęp do
 * konkretnego course'a" odbywa się na poziomie RLS bucketu (jeśli skonfigurowane)
 * lub w przyszłości — sprawdzeniem enrollment przed download.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const path = request.nextUrl.searchParams.get('path')
        if (!path || !path.startsWith('courses/')) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
        }

        const { data, error } = await supabase.storage.from('documents').download(path)
        if (error || !data) {
            return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
        }

        const buffer = Buffer.from(await data.arrayBuffer())
        const filename = path.split('/').pop() ?? 'attachment.pdf'

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
                'Cache-Control': 'private, max-age=300',
            },
        })
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Server error'
        logger.error({ event: 'api.learning.attachment.failed', error })
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
