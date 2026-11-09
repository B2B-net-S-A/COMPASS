import { z } from 'zod'
import { isAcademySwitchOn } from '@/lib/academy/switches'

/** Generowanie stoi za przełącznikiem z vault, domyślnie wyłączonym do decyzji o przekazaniu treści. */
export function aiDraftsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return isAcademySwitchOn('ACADEMY_AI_DRAFTS_ENABLED', env)
}

export const MATERIAL_MAX_CHARS = 30_000

const optionSchema = z.object({ option_text: z.string().trim().min(1).max(2000), is_correct: z.boolean(), explanation: z.string().trim().max(2000).nullable().optional() })
const draftSchema = z.object({
    question_text: z.string().trim().min(1).max(8000),
    topic_tag: z.string().trim().min(1).max(80).nullable().optional(),
    source_excerpt: z.string().trim().min(1).max(2000),
    options: z.array(optionSchema).min(2).max(6),
}).refine(draft => draft.options.filter(option => option.is_correct).length === 1, 'Dokładnie jedna poprawna odpowiedź.')
const critiqueSchema = z.object({ level: z.string().trim().max(40), clarity: z.string().trim().max(40), risk: z.string().trim().max(200).nullable().optional(), note: z.string().trim().max(1000).nullable().optional() })

export type QuestionDraftInput = z.infer<typeof draftSchema>
export type DraftCritique = z.infer<typeof critiqueSchema>
export type ChatJson = (options: { system: string; model: string; maxTokens: number; temperature: number; messages: { role: 'user'; content: string }[] }) => Promise<unknown>

/** Odrzuca pojedyncze wadliwe szkice zamiast całej paczki; liczba odrzuconych trafia do ekranu. */
export function parseDrafts(raw: unknown): { drafts: QuestionDraftInput[]; rejected: number } {
    const items = (raw as { questions?: unknown })?.questions
    if (!Array.isArray(items)) return { drafts: [], rejected: 0 }
    const drafts: QuestionDraftInput[] = []
    let rejected = 0
    for (const item of items) {
        const parsed = draftSchema.safeParse(item)
        if (parsed.success) drafts.push(parsed.data)
        else rejected++
    }
    return { drafts, rejected }
}

export function excerptAppearsInSource(excerpt: string, material: string): boolean {
    const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()
    return normalize(material).includes(normalize(excerpt))
}

const DRAFT_SYSTEM = `Tworzysz pytania jednokrotnego wyboru do testu wiedzy po polsku, wyłącznie na podstawie podanego materiału.
Pytanie opisuje krótki scenariusz z pracy i sprawdza zastosowanie albo zrozumienie, nie pamięć definicji.
Dokładnie jedna odpowiedź jest poprawna. Dystraktory są prawdopodobne, ale jednoznacznie błędne w tym scenariuszu.
Przy każdej odpowiedzi podaj krótkie wyjaśnienie. W source_excerpt przepisz dosłownie fragment materiału, na którym opierasz pytanie.
Zwróć obiekt {"questions":[{"question_text","topic_tag","source_excerpt","options":[{"option_text","is_correct","explanation"}]}]}.`
const CRITIC_SYSTEM = `Jesteś krytykiem pytań testowych. Dla każdego pytania oceń poziom (zapamiętanie, zrozumienie, zastosowanie), jednoznaczność (dobra, słaba) i ryzyko, na przykład dwie prawdopodobne odpowiedzi.
Zwróć obiekt {"critiques":[{"level","clarity","risk","note"}]} w tej samej kolejności co pytania.`

export async function generateQuestionDrafts(chat: ChatJson, input: { sourceLabel: string; material: string; count: number }) {
    const raw = await chat({ system: DRAFT_SYSTEM, model: 'sonnet', maxTokens: 8000, temperature: 0.4, messages: [{ role: 'user', content: `Liczba pytań: ${input.count}.\nMateriał (${input.sourceLabel}):\n${input.material}` }] })
    const parsed = parseDrafts(raw)
    // Fragment musi pochodzić z materiału, inaczej recenzent nie sprawdzi źródła pytania.
    const sourced = parsed.drafts.filter(draft => excerptAppearsInSource(draft.source_excerpt, input.material))
    const rejected = parsed.rejected + parsed.drafts.length - sourced.length
    if (sourced.length === 0) return { drafts: [], rejected }
    const criticRaw = await chat({ system: CRITIC_SYSTEM, model: 'sonnet', maxTokens: 4000, temperature: 0, messages: [{ role: 'user', content: JSON.stringify(sourced) }] }) as { critiques?: unknown[] }
    return {
        rejected,
        drafts: sourced.map((draft, index) => {
            const critique = critiqueSchema.safeParse(criticRaw?.critiques?.[index])
            return { ...draft, source_label: input.sourceLabel, critique: critique.success ? critique.data : { level: 'brak oceny', clarity: 'brak oceny', risk: null, note: null } }
        }),
    }
}
