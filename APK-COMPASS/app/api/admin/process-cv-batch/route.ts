import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { generateEmbedding } from '@/lib/ai/embeddings'

const BATCH_SIZE = 10

export async function POST(request: Request) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || !['admin', 'administrator'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: pending, error: fetchError } = await supabase
        .from('candidates')
        .select('id, cv_url, raw_text, full_name')
        .eq('cv_parsed', false)
        .eq('candidate_status', 'kandydat')
        .is('cv_parse_error', null)
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE)

    if (fetchError) {
        return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!pending || pending.length === 0) {
        return NextResponse.json({ processed: 0, message: 'Brak CV do przetworzenia' })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    let processed = 0
    let errors = 0
    const results: { id: string; name: string; status: string }[] = []

    for (const candidate of pending) {
        try {
            let text = candidate.raw_text

            if (!text && candidate.cv_url) {
                const { data: fileBlob, error: downloadError } = await supabase.storage
                    .from('documents')
                    .download(candidate.cv_url)

                if (downloadError || !fileBlob) {
                    await supabase.from('candidates').update({
                        cv_parse_error: `Download failed: ${downloadError?.message || 'No blob'}`,
                    }).eq('id', candidate.id)
                    errors++
                    results.push({ id: candidate.id, name: candidate.full_name || '?', status: 'download_error' })
                    continue
                }

                const buffer = Buffer.from(await fileBlob.arrayBuffer())
                const { parseBuffer } = await import('@/lib/files/parsers')
                const fileExt = candidate.cv_url.split('.').pop()?.toLowerCase()
                let mimeType = fileBlob.type
                if (!mimeType || mimeType === 'application/octet-stream') {
                    if (fileExt === 'pdf') mimeType = 'application/pdf'
                    else if (fileExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                }
                text = await parseBuffer(buffer, mimeType, candidate.cv_url)
            }

            if (!text || text.trim().length < 20) {
                await supabase.from('candidates').update({
                    cv_parsed: true,
                    cv_parse_error: 'Brak tekstu w CV',
                }).eq('id', candidate.id)
                errors++
                results.push({ id: candidate.id, name: candidate.full_name || '?', status: 'no_text' })
                continue
            }

            const sanitizedText = text.slice(0, 15000)

            const extractionResponse = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are an HR expert. Output a JSON object.' },
                    {
                        role: 'user',
                        content: `Analyze this CV and extract:
- full_name (string)
- skills (array of strings)
- previous_clients (array of strings)
- experience_years (number)
- bio (string, professional summary, max 1000 chars)
- email (string or null)
- phone (string or null)

CV Text:
${sanitizedText.slice(0, 10000)}

Respond with valid JSON.`
                    }
                ],
                response_format: { type: 'json_object' }
            })

            const aiData = JSON.parse(extractionResponse.choices[0].message.content || '{}')
            const summary = aiData.bio || sanitizedText.slice(0, 500)
            const embedding = await generateEmbedding(summary)

            await supabase.from('candidates').update({
                full_name: aiData.full_name || candidate.full_name,
                skills: aiData.skills || [],
                bio: summary,
                previous_clients: aiData.previous_clients || [],
                experience_years: typeof aiData.experience_years === 'number' ? aiData.experience_years : null,
                email: aiData.email || undefined,
                phone: aiData.phone || undefined,
                embedding,
                raw_text: text.substring(0, 50000),
                cv_parsed: true,
                cv_parse_error: null,
            }).eq('id', candidate.id)

            processed++
            results.push({ id: candidate.id, name: aiData.full_name || candidate.full_name || '?', status: 'ok' })

        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            await supabase.from('candidates').update({
                cv_parse_error: msg.substring(0, 500),
            }).eq('id', candidate.id)
            errors++
            results.push({ id: candidate.id, name: candidate.full_name || '?', status: 'error' })
        }
    }

    const { count: remainingCount } = await supabase
        .from('candidates')
        .select('id', { count: 'exact', head: true })
        .eq('cv_parsed', false)
        .eq('candidate_status', 'kandydat')
        .is('cv_parse_error', null)

    return NextResponse.json({
        processed,
        errors,
        remaining: remainingCount || 0,
        results,
    })
}
