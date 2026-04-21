import { NextResponse } from 'next/server'
import { getDigestHtml, generateDailyDigest } from '@/lib/actions/email-digest'

export async function POST(request: Request) {
    try {
        const { userId, sendEmail } = await request.json()

        if (!userId) {
            return NextResponse.json({ error: 'userId wymagany' }, { status: 400 })
        }

        const digest = await generateDailyDigest(userId)

        if (!digest.success) {
            return NextResponse.json({ error: digest.error }, { status: 500 })
        }

        if (sendEmail && digest.digest && digest.digest.length > 0) {
            const html = await getDigestHtml(userId)
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
