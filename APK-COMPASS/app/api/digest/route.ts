import { NextResponse } from 'next/server'
import { getDigestHtml, generateDailyDigest } from '@/lib/actions/email-digest'

// Security: userId no longer accepted from request body — the digest is scoped
// to the authenticated user via session lookup inside generateDailyDigest().
// Previous IDOR vector (caller could pass any userId and read someone else's
// digest) is closed.
export async function POST(request: Request) {
    try {
        const { sendEmail } = await request.json().catch(() => ({}))

        const digest = await generateDailyDigest()

        if (!digest.success) {
            const status = digest.error === 'Nie jesteś zalogowany' ? 401 : 500
            return NextResponse.json({ error: digest.error }, { status })
        }

        if (sendEmail && digest.digest && digest.digest.length > 0) {
            const html = await getDigestHtml()
            return NextResponse.json({
                success: true,
                itemCount: digest.digest.length,
                html,
            })
        }

        return NextResponse.json({
            success: true,
            itemCount: digest.digest?.length || 0,
            digest: digest.digest,
        })
    } catch {
        return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 })
    }
}
