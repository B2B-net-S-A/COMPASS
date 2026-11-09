import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { findLearnerAccountByEmail, learnerEntryDenial, normalizeLearnerEmail } from '@/lib/academy/learner-accounts'
import { createLearnerPassToken, learnerPassSecret, LEARNER_REENTRY_TTL_SECONDS } from '@/lib/academy/learner-pass'
import { ACADEMY_PERSONAL_LINK_PLACEHOLDER, holdAcademyMail, sendAcademyAutoMail, sendAcademyMailTest, testRecipients } from '@/lib/academy/outbound'
import { allowReentryRequest, clientIp } from '@/lib/academy/reentry-rate-limit'
import { isAcademySwitchOn } from '@/lib/academy/switches'
import { logger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'private, no-store' }
const bodySchema = z.object({ email: z.string().trim().min(3).max(320) })
const SAME_ANSWER = { ok: true, message: 'Jeśli ten adres ma konto w Akademii, wysłaliśmy na niego link. Link działa 15 minut.' }

function sameAnswer() {
    return NextResponse.json(SAME_ANSWER, { status: 200, headers: HEADERS })
}

function notFound() {
    return NextResponse.json({ error: 'Nie znaleziono.' }, { status: 404, headers: HEADERS })
}

function appBaseUrl(): string | null {
    const raw = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/$/, '')
    return /^https?:\/\//.test(raw) ? raw : null
}

/**
 * Prośba o jednorazowy link na 15 minut, wyłącznie dla kont z listy kont nauki.
 * Przy wyłączonej przepustce adres spoza skrzynek właściciela dostaje 404, bez wiersza
 * i bez wiadomości. Po włączeniu odpowiedź jest ta sama niezależnie od wyniku.
 * Wiadomość idzie przez bramkę B0.2: token powstaje dopiero w chwili wysyłki. Skrzynka
 * właściciela dostaje wysyłkę testową; zwykłe konto wychodzi regułą automatyczną bramki,
 * czyli dopiero przy włączonych ACADEMY_PASS_ENABLED i ACADEMY_MAIL_ENABLED. Inaczej
 * wiersz zostaje w kolejce i wygasa po 15 minutach.
 */
export async function POST(request: NextRequest) {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    const passOn = isAcademySwitchOn('ACADEMY_PASS_ENABLED')
    if (!parsed.success) return passOn ? sameAnswer() : notFound()

    const email = normalizeLearnerEmail(parsed.data.email)
    const ownerMailbox = testRecipients(process.env).has(email)
    if (!passOn && !ownerMailbox) return notFound()
    if (!allowReentryRequest(clientIp(request.headers), email)) return sameAnswer()

    try {
        const secret = learnerPassSecret()
        const baseUrl = appBaseUrl()
        if (!secret || !baseUrl) return sameAnswer()
        const client = createServiceClient() as unknown as SupabaseClient
        const account = await findLearnerAccountByEmail(client, email)
        if (!account || learnerEntryDenial(account)) return sameAnswer()

        const now = new Date()
        const bucket = Math.floor(now.getTime() / (LEARNER_REENTRY_TTL_SECONDS * 1000))
        const held = await holdAcademyMail(client, {
            kind: 'academy.reentry',
            recipient: account.email,
            subject: 'Twój link do Akademii COMPASS',
            html: `<p>Oto Twój link do Akademii COMPASS. Działa 15 minut i tylko raz.</p><p><a href="${ACADEMY_PERSONAL_LINK_PLACEHOLDER}">Wejdź do Akademii</a></p><p>Jeśli to nie Ty prosisz o link, zignoruj tę wiadomość.</p>`,
            expiresAt: new Date(now.getTime() + LEARNER_REENTRY_TTL_SECONDS * 1000).toISOString(),
            dedupeKey: `academy.reentry:${account.id}:${bucket}`,
            // Własna jednoelementowa paczka: zatwierdzenie regułą wymaga batch_id w bazie.
            batchId: randomUUID(),
        })
        if (held.status !== 'held') return sameAnswer()

        const personalLink = async () => `${baseUrl}/wejdz/${createLearnerPassToken({ accountId: account.id, purpose: 'r', ttlSeconds: LEARNER_REENTRY_TTL_SECONDS }, secret)}`
        if (ownerMailbox) await sendAcademyMailTest(client, { id: held.id, personalLink })
        else await sendAcademyAutoMail(client, { id: held.id, personalLink })
        return sameAnswer()
    } catch (error) {
        logger.error({ event: 'academy.learner_reentry.failed', error })
        return sameAnswer()
    }
}
