'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { chatJSON } from '@/lib/ai/llm'
import type { ActionResult, QuizQuestionInput } from '@/lib/types/learning'

// ============================================================
// A3.3 — AI Quiz Generator
// ============================================================

interface GeneratedQuiz {
    questions: Array<{
        question_text: string
        options: Array<{ option_text: string; is_correct: boolean }>
    }>
}

/**
 * A3.3: Generuje propozycję quizu (5 pytań × 4 opcje, 1 poprawna) na bazie
 * treści lekcji kursu. Używa Claude Sonnet 4.5 (lepsza jakość niż Haiku
 * przy generowaniu pytań).
 *
 * Output: lista QuizQuestionInput gotowa do `saveQuiz()`. Autor edytuje przed save.
 *
 * Auth: tylko autor kursu lub admin.
 * Cost: ~$0.05 per call (Sonnet 4.5, ~5k input + 2k output tokens).
 */
export async function generateQuizFromCourse(
    courseId: string,
    options: { questionCount?: number } = {},
): Promise<ActionResult<{ questions: QuizQuestionInput[] }>> {
    try {
        const supabase = createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        // Auth check
        const { data: course } = await supabase
            .from('courses')
            .select('id, title, author_id')
            .eq('id', courseId)
            .single<{ id: string; title: string; author_id: string }>()
        if (!course) return { success: false, error: 'Kurs nie istnieje' }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single<{ role: string }>()
        const isAdmin = profile?.role === 'admin'
        if (course.author_id !== user.id && !isAdmin) {
            return { success: false, error: 'Tylko autor kursu lub admin może generować quiz' }
        }

        // Pull lekcje (content_md)
        const { data: lessons } = await supabase
            .from('course_lessons')
            .select('title, content_md')
            .eq('course_id', courseId)
            .order('order_index')
        const lessonContent = ((lessons ?? []) as Array<{ title: string; content_md: string | null }>)
            .filter((l) => l.content_md && l.content_md.trim().length > 50)
            .map((l) => `### ${l.title}\n${l.content_md}`)
            .join('\n\n---\n\n')

        if (lessonContent.length < 200) {
            return {
                success: false,
                error: 'Treść lekcji jest za krótka do wygenerowania quizu (min 200 znaków łącznie).',
            }
        }

        const questionCount = Math.max(4, Math.min(10, options.questionCount ?? 5))

        // Generate via Sonnet
        const result = await chatJSON<GeneratedQuiz>({
            model: 'claude-sonnet-4-5',
            maxTokens: 3000,
            temperature: 0.4,
            system: `Jesteś ekspertem od pedagogiki cyfrowej, specjalizującym się w tworzeniu pytań quizowych dla kursów online.

Twoje zadanie: wygeneruj quiz końcowy dla kursu, używając tylko informacji z dostarczonej treści lekcji.

Zasady:
- Dokładnie ${questionCount} pytań
- Każde pytanie ma 4 opcje (A, B, C, D)
- Tylko 1 opcja jest poprawna
- Pytania testują rozumienie, nie zapamiętywanie literalnych zdań
- Mieszaj poziomy trudności (2 łatwe, 2 średnie, 1 trudne)
- Pytania po polsku, naturalnym językiem
- Opcje powinny być wiarygodne (nie oczywiście błędne)
- Unikaj pytań negatywnych ("Które NIE jest...")
- Pisz pytania zwięźle (max 25 słów)
- Opcje krótko (max 15 słów)

Odpowiedź w JSON:
{
  "questions": [
    {
      "question_text": "...",
      "options": [
        { "option_text": "...", "is_correct": false },
        { "option_text": "...", "is_correct": true },
        { "option_text": "...", "is_correct": false },
        { "option_text": "...", "is_correct": false }
      ]
    },
    ...
  ]
}`,
            messages: [
                {
                    role: 'user',
                    content: `Tytuł kursu: ${course.title}\n\nTreść lekcji:\n\n${lessonContent}\n\nWygeneruj ${questionCount} pytań quizowych.`,
                },
            ],
        })

        // Walidacja struktury
        if (!result.questions || !Array.isArray(result.questions) || result.questions.length === 0) {
            return { success: false, error: 'LLM zwrócił niepoprawny JSON' }
        }

        const validated: QuizQuestionInput[] = []
        for (const q of result.questions) {
            if (!q.question_text || typeof q.question_text !== 'string') continue
            if (!Array.isArray(q.options) || q.options.length !== 4) continue
            const correctCount = q.options.filter((o) => o.is_correct).length
            if (correctCount !== 1) continue // Skip malformed (must have exactly 1 correct)
            validated.push({
                question_text: q.question_text,
                options: q.options.map((o) => ({
                    option_text: String(o.option_text ?? ''),
                    is_correct: !!o.is_correct,
                })),
            })
        }

        if (validated.length === 0) {
            return { success: false, error: 'LLM zwrócił pytania bez prawidłowej struktury (1 correct opcja)' }
        }

        return { success: true, data: { questions: validated } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd generowania quizu'
        logCompat.error('[generateQuizFromCourse]', error)
        return { success: false, error: msg }
    }
}
