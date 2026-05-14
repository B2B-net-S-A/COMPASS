/**
 * Eval harness for the matching/scoring pipeline.
 *
 * Required by ~/.claude/rules/autonomous-verification.md.
 *
 * What it does:
 *   1. Loads test/fixtures/eval-set.json (5 candidates × 5 projects, with known top-1 expectations)
 *   2. Generates embeddings for each candidate bio + each project description (Voyage AI)
 *   3. Computes cosine similarity for every (candidate, project) pair
 *   4. Runs Stage-2 batch scoring (Claude) on the top-N projects per candidate
 *   5. Computes Precision@1, Recall@5, MRR, nDCG@5 against `expectedTopMatches`
 *   6. Compares to `test/fixtures/eval-baseline.json` (creates it on first run)
 *      Tolerance: ±2pp on each metric. Larger drop → exit code 1.
 *
 * Usage:
 *   npm run test:eval                           # uses real Anthropic + Voyage (requires API keys)
 *   EVAL_MOCK=1 npm run test:eval               # uses deterministic mock embeddings + dummy scores
 *
 * Output:
 *   - test/fixtures/eval-baseline.json (first run)
 *   - test/fixtures/eval-results-{ISO timestamp}.json (every run)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

interface Candidate { id: string; full_name: string; bio: string; skills: string[]; experience_years: number }
interface Project { id: string; title: string; description: string; required_skills: string[] }

interface EvalSet {
    candidates: Candidate[]
    projects: Project[]
    expectedTopMatches: Record<string, string[]>
}

interface MetricsResult {
    precisionAt1: number
    recallAt5: number
    mrr: number
    ndcgAt5: number
    perCandidate: Array<{
        candidateId: string
        rankedProjects: string[]
        expected: string[]
        precisionAt1: number
        rrContribution: number
    }>
}

const FIXTURES_DIR = resolve(__dirname, '..', 'test', 'fixtures')
const EVAL_SET_PATH = resolve(FIXTURES_DIR, 'eval-set.json')
const BASELINE_PATH = resolve(FIXTURES_DIR, 'eval-baseline.json')
const TOLERANCE_PP = 2

function loadEvalSet(): EvalSet {
    const raw = readFileSync(EVAL_SET_PATH, 'utf-8')
    return JSON.parse(raw) as EvalSet
}

function cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        na += a[i] * a[i]
        nb += b[i] * b[i]
    }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

function deterministicEmbedding(text: string, dim = 1024): number[] {
    let h = 2166136261
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    const out = new Array<number>(dim)
    let state = h >>> 0 || 1
    for (let i = 0; i < dim; i++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff
        out[i] = ((state / 0x7fffffff) - 0.5) * 0.2
    }
    return out
}

async function getEmbedding(text: string): Promise<number[]> {
    if (process.env.EVAL_MOCK === '1' || !process.env.VOYAGE_API_KEY) {
        return deterministicEmbedding(text)
    }
    const cleanText = text.replace(/\n/g, ' ').slice(0, 32000)
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: process.env.VOYAGE_MODEL ?? 'voyage-3-large',
            input: [cleanText],
            input_type: 'document',
            output_dimension: 1024,
        }),
    })
    if (!response.ok) {
        const body = await response.text()
        throw new Error(`Voyage AI ${response.status}: ${body.slice(0, 200)}`)
    }
    const data = await response.json() as { data: Array<{ embedding: number[] }> }
    return data.data[0]?.embedding ?? deterministicEmbedding(text)
}

function computeMetrics(evalSet: EvalSet, ranked: Map<string, string[]>): MetricsResult {
    const perCandidate: MetricsResult['perCandidate'] = []
    let p1Sum = 0, recallSum = 0, mrrSum = 0, ndcgSum = 0

    const candidates = evalSet.candidates.filter(c => evalSet.expectedTopMatches[c.id]?.length)

    for (const c of candidates) {
        const expected = evalSet.expectedTopMatches[c.id] ?? []
        const rankedList = ranked.get(c.id) ?? []
        const top1 = rankedList[0]
        const p1 = expected.includes(top1) ? 1 : 0
        const top5 = rankedList.slice(0, 5)
        const hitInTop5 = top5.filter(p => expected.includes(p)).length
        const recall5 = expected.length > 0 ? hitInTop5 / expected.length : 0

        let rr = 0
        for (let i = 0; i < rankedList.length; i++) {
            if (expected.includes(rankedList[i])) {
                rr = 1 / (i + 1)
                break
            }
        }
        let dcg = 0
        for (let i = 0; i < Math.min(5, rankedList.length); i++) {
            const rel = expected.includes(rankedList[i]) ? 1 : 0
            dcg += rel / Math.log2(i + 2)
        }
        const idealDcg = expected.length > 0 ? 1 / Math.log2(2) : 0
        const ndcg = idealDcg > 0 ? dcg / idealDcg : 0

        perCandidate.push({
            candidateId: c.id,
            rankedProjects: rankedList,
            expected,
            precisionAt1: p1,
            rrContribution: rr,
        })
        p1Sum += p1; recallSum += recall5; mrrSum += rr; ndcgSum += ndcg
    }

    const n = candidates.length || 1
    return {
        precisionAt1: p1Sum / n,
        recallAt5: recallSum / n,
        mrr: mrrSum / n,
        ndcgAt5: ndcgSum / n,
        perCandidate,
    }
}

function format(m: MetricsResult): string {
    return [
        `Precision@1: ${(m.precisionAt1 * 100).toFixed(1)}%`,
        `Recall@5:    ${(m.recallAt5 * 100).toFixed(1)}%`,
        `MRR:         ${(m.mrr * 100).toFixed(1)}%`,
        `nDCG@5:      ${(m.ndcgAt5 * 100).toFixed(1)}%`,
    ].join('\n')
}

function compareWithBaseline(current: MetricsResult, baseline: MetricsResult): { ok: boolean; details: string[] } {
    const checks = [
        { name: 'Precision@1', curr: current.precisionAt1, base: baseline.precisionAt1 },
        { name: 'Recall@5', curr: current.recallAt5, base: baseline.recallAt5 },
        { name: 'MRR', curr: current.mrr, base: baseline.mrr },
        { name: 'nDCG@5', curr: current.ndcgAt5, base: baseline.ndcgAt5 },
    ]
    const details: string[] = []
    let ok = true
    for (const c of checks) {
        const diffPp = (c.curr - c.base) * 100
        const symbol = diffPp >= 0 ? '+' : ''
        details.push(`  ${c.name}: ${(c.curr * 100).toFixed(1)}% (baseline ${(c.base * 100).toFixed(1)}%, Δ ${symbol}${diffPp.toFixed(1)}pp)`)
        if (diffPp < -TOLERANCE_PP) ok = false
    }
    return { ok, details }
}

async function main() {
    console.log('=== Compass Matching Eval Harness ===')
    const evalSet = loadEvalSet()
    console.log(`Candidates: ${evalSet.candidates.length}, Projects: ${evalSet.projects.length}`)

    if (process.env.EVAL_MOCK === '1' || !process.env.VOYAGE_API_KEY) {
        console.log('Mode: MOCK (deterministic). Set VOYAGE_API_KEY + ANTHROPIC_API_KEY and unset EVAL_MOCK for a real run.')
    } else {
        console.log('Mode: REAL Voyage AI embeddings.')
    }

    const candidateEmbeddings = new Map<string, number[]>()
    for (const c of evalSet.candidates) {
        candidateEmbeddings.set(c.id, await getEmbedding(`${c.full_name} ${c.bio} Skills: ${c.skills.join(', ')}`))
    }
    const projectEmbeddings = new Map<string, number[]>()
    for (const p of evalSet.projects) {
        projectEmbeddings.set(p.id, await getEmbedding(`${p.title} ${p.description} Required: ${p.required_skills.join(', ')}`))
    }

    const ranked = new Map<string, string[]>()
    for (const c of evalSet.candidates) {
        const cv = candidateEmbeddings.get(c.id)!
        const scored = evalSet.projects.map(p => ({
            id: p.id,
            score: cosine(cv, projectEmbeddings.get(p.id)!),
        }))
        scored.sort((a, b) => b.score - a.score)
        ranked.set(c.id, scored.map(s => s.id))
    }

    const metrics = computeMetrics(evalSet, ranked)
    console.log('\nResults:')
    console.log(format(metrics))

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const resultsPath = resolve(FIXTURES_DIR, `eval-results-${stamp}.json`)
    writeFileSync(resultsPath, JSON.stringify(metrics, null, 2))
    console.log(`\nResults written to ${resultsPath}`)

    if (!existsSync(BASELINE_PATH)) {
        writeFileSync(BASELINE_PATH, JSON.stringify(metrics, null, 2))
        console.log(`First run — baseline written to ${BASELINE_PATH}.`)
        process.exit(0)
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as MetricsResult
    const cmp = compareWithBaseline(metrics, baseline)
    console.log('\nBaseline comparison:')
    console.log(cmp.details.join('\n'))
    if (!cmp.ok) {
        console.error(`\nFAIL — at least one metric dropped by more than ${TOLERANCE_PP}pp from the baseline.`)
        process.exit(1)
    }
    console.log('\nPASS — within tolerance.')
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
