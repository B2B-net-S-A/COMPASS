'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { chatText } from '@/lib/ai/llm'
import type { ActionResult } from '@/lib/types/learning'

// ============================================================
// Phase A3.2 — AI Lesson Summarizer
// ============================================================

/**
 * A3.2: Generuje 3-bullet TL;DR + kluczowe takeawaye dla lekcji.
 * Cache: zapisuje do `course_lessons.ai_summary`. Reuse jeśli istnieje (chyba że force=true).
 *
 * Auth: dowolny zalogowany user (read access przez course RLS).
 * Cost: ~$0.001 per lekcję (Haiku 4.5).
 */
export async function getOrGenerateLessonSummary(
    lessonId: string,
    options: { force?: boolean } = {},
): Promise<ActionResult<{ summary: string; cached: boolean }>> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: lesson, error: fetchErr } = await supabase
            .from('course_lessons')
            .select('id, course_id, title, content_md, ai_summary, ai_summary_generated_at')
            .eq('id', lessonId)
            .single<{
                id: string
                course_id: string
                title: string
                content_md: string | null
                ai_summary: string | null
                ai_summary_generated_at: string | null
            }>()
        if (fetchErr || !lesson) {
            return { success: false, error: 'Lekcja nie istnieje lub brak dostępu' }
        }

        // Cache hit: reuse istniejące summary chyba że force
        if (lesson.ai_summary && !options.force) {
            return {
                success: true,
                data: { summary: lesson.ai_summary, cached: true },
            }
        }

        if (!lesson.content_md || lesson.content_md.trim().length < 100) {
            return {
                success: false,
                error: 'Lekcja nie ma wystarczająco treści do streszczenia (min 100 znaków).',
            }
        }

        // Wywołanie LLM — Haiku 4.5 dla low cost
        const summary = await chatText({
            model: 'claude-haiku-4-5',
            maxTokens: 600,
            temperature: 0.3,
            system: `Jesteś pomocnym asystentem edukacyjnym. Streszczaj lekcje kursowe po polsku w sposób zwięzły i praktyczny.
Format odpowiedzi:
**Streszczenie (3 punkty):**
• [punkt 1]
• [punkt 2]
• [punkt 3]

**Kluczowe takeawaye:**
• [konkretna umiejętność/wniosek 1]
• [konkretna umiejętność/wniosek 2]

Zachowuj zwięzłość — każdy bullet do 25 słów.`,
            messages: [
                {
                    role: 'user',
                    content: `Tytuł lekcji: ${lesson.title}\n\nTreść:\n${lesson.content_md}`,
                },
            ],
        })

        if (!summary) {
            return { success: false, error: 'LLM nie zwrócił treści' }
        }

        // Cache w DB (write z server-only — używamy zwykłego client, RLS pozwoli tylko jeśli user jest autorem/adminem)
        // Dla read-only dostępu (student): summary jest w response, ale nie zapisuje się — możemy spróbować, ignorować błąd RLS.
        await supabase
            .from('course_lessons')
            .update({
                ai_summary: summary,
                ai_summary_generated_at: new Date().toISOString(),
            })
            .eq('id', lessonId)

        return {
            success: true,
            data: { summary, cached: false },
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd generowania streszczenia'
        logCompat.error('[getOrGenerateLessonSummary]', error)
        return { success: false, error: msg }
    }
}
