// Phase 48 — zakładka „Monitoring prawny" w hubie Administracja HR (finanse + admin).
//
// Trzy warstwy: banner stanu monitoringu (czy pipeline w ogóle chodzi), skrzynka
// wpisów do przeglądu i log przebiegów. Wszystko z dwóch tabel — moduł nie sięga
// do internetu.

import {
    listLegalMonitorItems,
    listLegalMonitorRuns,
    listRecentHolidays,
} from '@/lib/actions/legal-monitor'
import { computeMonitorHealth } from '@/lib/legal-monitor/health'
import { LegalMonitorHealthBanner } from '@/components/internal/legal-monitor/LegalMonitorHealthBanner'
import { LegalMonitorList } from '@/components/internal/legal-monitor/LegalMonitorList'
import { LegalMonitorRunsHistory } from '@/components/internal/legal-monitor/LegalMonitorRunsHistory'

export async function AdminLegalMonitorPanel() {
    const [items, runs, holidays] = await Promise.all([
        listLegalMonitorItems(),
        listLegalMonitorRuns(),
        listRecentHolidays(),
    ])

    const health = computeMonitorHealth({
        lastRun: runs[0] ?? null,
        now: new Date(),
        holidays,
    })

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Codzienny przegląd źródeł prawnych istotnych dla modelu firmy (B2B a art. 22 KP,
                estoński CIT, ZUS, legislacja, TK). Wpisy dopisuje automat — tutaj decydujesz, co z
                nimi zrobić.
            </p>

            <LegalMonitorHealthBanner health={health} />
            <LegalMonitorList items={items} />
            <LegalMonitorRunsHistory runs={runs} />
        </div>
    )
}
