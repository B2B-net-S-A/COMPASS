import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import {
    consumePulseRateLimit,
    PULSE_UNAVAILABLE_MESSAGE,
    submitPulseResponse,
} from '@/lib/consultant-success-public'
import { areConsultantSuccessSurveysEnabled } from '@/lib/consultant-success/flags'

export const dynamic = 'force-dynamic'
// UWAGA: `maxDuration` jest tu MARTWE. Next 14.2 czyta ten eksport przy buildzie i
// tłumaczy go na limit funkcji serverless (Vercel/Lambda); w kontenerze na Coolify nikt
// go nie egzekwuje, więc nie jest to działająca ochrona przed zawieszonym przebiegiem.
// Zostaje jako deklaracja intencji na wypadek zmiany hostingu — realnym limitem jest
// timeout per żądanie na proxy (Traefik/Cloudflare) i limity samych wywołań.
export const maxDuration = 30

const payloadSchema = z.object({
    satisfactionScore: z.coerce.number().int().min(0).max(10),
    engagementScore: z.coerce.number().int().min(1).max(5),
    recommendationScore: z.coerce.number().int().min(0).max(10),
    note: z.string().trim().max(2000).optional().nullable(),
})

function unavailable() {
    return NextResponse.json({ ok: false, message: PULSE_UNAVAILABLE_MESSAGE }, { status: 400 })
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
    if (!areConsultantSuccessSurveysEnabled()) return unavailable()

    const token = params.token ?? ''
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? 'unknown'

    const allowed = await consumePulseRateLimit({ token, ipAddress })
    if (!allowed) {
        return NextResponse.json(
            { ok: false, message: 'Zbyt wiele prób. Spróbuj ponownie później.' },
            { status: 429 },
        )
    }

    let payload: z.infer<typeof payloadSchema>
    try {
        payload = payloadSchema.parse(await request.json())
    } catch {
        return unavailable()
    }

    const accepted = await submitPulseResponse({
        token,
        satisfactionScore: payload.satisfactionScore,
        engagementScore: payload.engagementScore,
        recommendationScore: payload.recommendationScore,
        note: payload.note || null,
    })

    if (!accepted) return unavailable()
    return NextResponse.json({ ok: true })
}
