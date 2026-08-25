import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'

export const dynamic = 'force-dynamic'

/**
 * Audyt 2026-08 (C5) — retencja dziennika czynności.
 *
 * Dokument „Polityka Retencji Danych" deklaruje: „Logi: 12 mies.", a
 * `audit_logs` rosło od pierwszego wpisu bez żadnego mechanizmu czyszczenia.
 * Deklarowany okres przechowywania, którego nikt nie egzekwuje, jest gorszy niż
 * brak deklaracji — to zobowiązanie wobec osób, których dane tam siedzą
 * (`user_id`, `ip_address` i treść `details`).
 *
 * Dlaczego dzienny, a nie miesięczny: harmonogramy tej instancji potrafią nie
 * odpalać tygodniami (patrz `coolify_cron_needs_container_name`, Faza 41b/54).
 * Przebieg dzienny sam nadrabia zaległość, a przy zerowej zaległości kosztuje
 * jedno zapytanie.
 *
 * Kasowanie jest tu WŁAŚCIWE, mimo reguły „zacieraj, nie kasuj" z
 * `lib/gdpr/subject-data.ts`: tam chodzi o rekordy z WŁASNYM, dłuższym okresem
 * przechowywania. Tutaj upływ okresu jest właśnie powodem usunięcia.
 *
 * Trigger: dziennie (Coolify / GH Actions).
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://compass.dynaminds.pl/api/cron/audit-log-retention"
 *
 * `?dryRun=1` liczy, nie kasuje — do sprawdzenia zasięgu przed pierwszym biegiem.
 */

/** 12 miesięcy z „Polityki Retencji Danych". */
const RETENTION_MONTHS = 12

/**
 * Sufit na jeden przebieg. Pierwsze uruchomienie po latach mogłoby chcieć skasować
 * wszystko naraz i zawiesić żądanie na blokadzie; przy przebiegu dziennym nadwyżka
 * i tak schodzi w kolejnych dniach.
 */
const MAX_DELETED_PER_RUN = 20000

export const GET = withCronAuth(withCronHeartbeat('AUDIT_LOG_RETENTION_RUN', async (request, { admin }) => {
    const cutoffDate = new Date()
    cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - RETENTION_MONTHS)
    const cutoff = cutoffDate.toISOString()

    const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'

    if (dryRun) {
        const { count, error } = await admin
            .from('audit_logs')
            .select('id', { count: 'exact', head: true })
            .lt('created_at', cutoff)

        if (error) {
            logCompat.error('[audit-log-retention] count error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json({ ok: true, dryRun: true, cutoff, wouldDelete: count ?? 0 })
    }

    // Kasujemy po identyfikatorach z ograniczonego wyboru, a nie jednym DELETE po
    // dacie — dzięki temu sufit na przebieg jest realny, a nie zależny od tego,
    // ile wierszy akurat zmieściło się poniżej progu.
    const { data: doomed, error: selectError } = await admin
        .from('audit_logs')
        .select('id')
        .lt('created_at', cutoff)
        .limit(MAX_DELETED_PER_RUN)

    if (selectError) {
        logCompat.error('[audit-log-retention] select error:', selectError)
        return NextResponse.json({ error: selectError.message }, { status: 500 })
    }

    const ids = (doomed ?? []).map(row => row.id)
    if (ids.length === 0) {
        return NextResponse.json({ ok: true, cutoff, deleted: 0, capped: false })
    }

    const { error: deleteError } = await admin.from('audit_logs').delete().in('id', ids)

    if (deleteError) {
        logCompat.error('[audit-log-retention] delete error:', deleteError)
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({
        ok: true,
        cutoff,
        deleted: ids.length,
        // True → zostały jeszcze starsze wpisy; dokasuje je jutrzejszy przebieg.
        capped: ids.length === MAX_DELETED_PER_RUN,
    })
}))
