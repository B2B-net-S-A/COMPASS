import { createClient } from '@/lib/supabase/server'
import { CandidatesListClient } from "@/components/admin/CandidatesListClient"
import { SearchInput } from "@/components/admin/SearchInput"
import { SortSelect } from "@/components/admin/SortSelect"
import { ProtectedPage } from '@/components/common/ProtectedPage'

export default async function AdminCandidatesPage({
    searchParams
}: {
    searchParams?: {
        q?: string
        sort?: string
        page?: string
        status?: string
    }
}) {
    const supabase = createClient()
    const query = searchParams?.q || ''
    const sort = searchParams?.sort || 'newest'
    const page = parseInt(searchParams?.page || '1')
    const statusFilter = searchParams?.status || 'all'
    const pageSize = 20

    let dbQuery = supabase
        .from('candidates')
        .select('id, full_name, email, avatar_url, skills, experience_years, current_status, created_at, verifier_status, ambassador_status, sales_support_status, bio, cv_url, candidate_status, source', { count: 'exact' })

    if (statusFilter === 'kandydat') {
        dbQuery = dbQuery.eq('candidate_status', 'kandydat')
    } else if (statusFilter === 'konsultant') {
        dbQuery = dbQuery.eq('candidate_status', 'konsultant')
    } else if (statusFilter === 'duplicate') {
        dbQuery = dbQuery.eq('candidate_status', 'duplicate')
    } else if (statusFilter === 'archived') {
        dbQuery = dbQuery.eq('candidate_status', 'archived')
    }

    if (query) {
        dbQuery = dbQuery.or(`full_name.ilike.%${query}%,email.ilike.%${query}%,bio.ilike.%${query}%`)
    }

    const orderCol = sort === 'alpha_asc' ? 'full_name' : sort === 'exp_desc' || sort === 'exp_asc' ? 'experience_years' : 'created_at'
    const ascending = sort === 'oldest' || sort === 'exp_asc' || sort === 'alpha_asc'

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data: allCandidates, error, count } = await dbQuery
        .order(orderCol, { ascending })
        .range(from, to)

    if (error) {
        console.error('Error fetching candidates:', error)
    }

    const candidates = allCandidates || []
    const totalCount = count || 0
    const totalPages = Math.ceil(totalCount / pageSize)
    const paginatedCandidates = candidates

    // Pre-fetch match summaries from cache (match_results table) — NO expensive RPC calls
    // This uses already-computed results. If no cached results exist, show 0 (user can trigger scoring from detail page)
    const candidateIds = paginatedCandidates.map(c => c.id)
    const matchCounts: Record<string, { total: number, high: number, medium: number, low: number }> = {}

    if (candidateIds.length > 0) {
        try {
            const { data: cachedResults } = await supabase
                .from('match_results')
                .select('candidate_id, score')
                .in('candidate_id', candidateIds)

            if (cachedResults) {
                for (const r of cachedResults) {
                    if (!matchCounts[r.candidate_id]) {
                        matchCounts[r.candidate_id] = { total: 0, high: 0, medium: 0, low: 0 }
                    }
                    const counts = matchCounts[r.candidate_id]
                    counts.total++
                    const sim = (r.score || 0) / 100
                    if (sim >= 0.9) counts.high++
                    else if (sim >= 0.7) counts.medium++
                    else if (sim >= 0.5) counts.low++
                }
            }
        } catch {
            // match_results table may not exist yet — graceful degradation
        }
    }

    const candidatesWithMatches = paginatedCandidates.map(c => {
        const counts = matchCounts[c.id] || { total: 0, high: 0, medium: 0, low: 0 }
        const pseudoMatches = [
            ...Array(counts.high).fill({ similarity: 0.95 }),
            ...Array(counts.medium).fill({ similarity: 0.75 }),
            ...Array(counts.low).fill({ similarity: 0.55 })
        ]
        return { ...c, matches: pseudoMatches }
    })

    const statusTabs = [
        { key: 'all', label: 'Wszyscy' },
        { key: 'kandydat', label: 'Kandydaci' },
        { key: 'konsultant', label: 'Konsultanci' },
        { key: 'duplicate', label: 'Duplikaty' },
        { key: 'archived', label: 'Archiwum' },
    ]

    return (
        <ProtectedPage feature="candidates">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Baza Konsultantow</h1>
                    <p className="text-muted-foreground">
                        {totalCount} rekordow {statusFilter !== 'all' ? `(filtr: ${statusFilter})` : ''}
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    {(query || statusFilter !== 'all') && (
                        <div className="flex items-center">
                            <a href="/admin/candidates" className="text-xs text-muted-foreground hover:text-white mr-2">
                                Wyczysc filtry
                            </a>
                        </div>
                    )}
                    <SearchInput placeholder="Szukaj konsultanta..." />
                    <SortSelect />
                </div>
            </div>

            <div className="flex gap-1 mb-4 flex-wrap">
                {statusTabs.map(tab => (
                    <a
                        key={tab.key}
                        href={`/admin/candidates?status=${tab.key}${query ? `&q=${query}` : ''}${sort !== 'newest' ? `&sort=${sort}` : ''}`}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                            statusFilter === tab.key
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                        }`}
                    >
                        {tab.label}
                    </a>
                ))}
            </div>

            <CandidatesListClient
                candidates={candidatesWithMatches}
                currentPage={page}
                totalPages={totalPages}
                totalCount={totalCount}
            />
        </ProtectedPage>
    )
}
