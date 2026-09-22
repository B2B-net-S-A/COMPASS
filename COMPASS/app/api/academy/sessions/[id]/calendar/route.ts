import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAcademyContext } from '@/lib/academy/server'
import { createAcademyCalendarFile, type AcademyCalendarEvent } from '@/lib/academy/calendar'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
    const id = z.uuid().safeParse(params.id)
    if (!id.success) return NextResponse.json({ error: 'Nie znaleziono wydarzenia.' }, { status: 404 })
    try {
        const { client } = await requireAcademyContext()
        const { data, error } = await client.rpc('academy_session_calendar', { p_session_id: id.data })
        if (error || !data) return NextResponse.json({ error: 'Nie znaleziono wydarzenia lub nie masz do niego dostępu.' }, { status: 404 })
        return new Response(createAcademyCalendarFile(data as AcademyCalendarEvent), { headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `attachment; filename="compass-${id.data}.ics"`,
            'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        } })
    } catch {
        return NextResponse.json({ error: 'Nie można pobrać wydarzenia. Zaloguj się i spróbuj ponownie.' }, { status: 403 })
    }
}
