'use client'

// Phase 37 — "Onboarding & Exit": one module for both populations — internal employees
// (template checklists + buddy + check-ins) and external contractors (single-form interviews).
// Differs only by the documents/forms per person type; detail/edit reuse the existing pages.

import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { FileText, Users, Archive } from 'lucide-react'
import { HubActionButtons } from '@/app/(protected)/internal/lifecycle/components/HubActionButtons'
import { OnboardingPanel } from '@/components/internal/kontraktorzy/panels/OnboardingPanel'
import { INTERVIEW_STATUS_PL, type OnboardingQueueItem, type EntryListItem, type ExitQueueItem } from '@/lib/types/contractor'

interface EmployeeOnboardingRow {
    progress_id: string
    full_name: string | null
    email: string
    tasks_total: number
    tasks_completed: number
    tasks_overdue: number
    started_at: string
}

interface Props {
    employeeOnboarding: EmployeeOnboardingRow[]
    contractorOnboarding: OnboardingQueueItem[]
    contractorExit: ExitQueueItem[]
    entries: EntryListItem[]
}

export function OnboardingHub({ employeeOnboarding, contractorOnboarding, contractorExit, entries }: Props) {
    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Onboarding &amp; Exit</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Pracownicy wewnętrzni i konsultanci u klientów — jeden moduł, różne dokumenty per typ osoby.
                    </p>
                </div>
            </header>

            <Tabs defaultValue="pracownicy">
                <TabsList className="flex flex-wrap">
                    <TabsTrigger value="pracownicy">Pracownicy ({employeeOnboarding.length})</TabsTrigger>
                    <TabsTrigger value="konsultanci">Konsultanci ({contractorOnboarding.length})</TabsTrigger>
                </TabsList>

                {/* ── Pracownicy wewnętrzni ── */}
                <TabsContent value="pracownicy" className="space-y-4">
                    <section className="rounded-lg border-2 border-dashed border-primary/30 bg-card p-4">
                        <h2 className="mb-3 text-sm font-semibold">Szybkie akcje</h2>
                        <HubActionButtons />
                    </section>

                    <div className="flex flex-wrap gap-2">
                        <Link href="/internal/lifecycle/templates" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"><FileText className="h-4 w-4" /> Szablony</Link>
                        <Link href="/internal/lifecycle/employees" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"><Users className="h-4 w-4" /> Pracownicy</Link>
                        <Link href="/internal/lifecycle/archive" className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"><Archive className="h-4 w-4" /> Archiwum</Link>
                    </div>

                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold">Aktywne onboardingi pracowników ({employeeOnboarding.length})</h3>
                        <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50"><tr>
                                    <th className="p-2 text-left">Pracownik</th>
                                    <th className="p-2 text-left">Postęp</th>
                                    <th className="p-2 text-left">Start</th>
                                    <th className="p-2"></th>
                                </tr></thead>
                                <tbody>
                                    {employeeOnboarding.map((r) => (
                                        <tr key={r.progress_id} className="border-t">
                                            <td className="p-2 font-medium">{r.full_name ?? r.email}</td>
                                            <td className="p-2">
                                                {r.tasks_completed} / {r.tasks_total}
                                                {r.tasks_overdue > 0 && <span className="ml-2 text-destructive">• {r.tasks_overdue} po terminie</span>}
                                            </td>
                                            <td className="p-2 text-muted-foreground">{new Date(r.started_at).toLocaleDateString('pl-PL')}</td>
                                            <td className="p-2 text-right">
                                                <Link href={`/internal/lifecycle/onboarding/${r.progress_id}`} className="text-primary hover:underline">Otwórz →</Link>
                                            </td>
                                        </tr>
                                    ))}
                                    {employeeOnboarding.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Brak aktywnych onboardingów.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </TabsContent>

                {/* ── Konsultanci (kontraktorzy) ── */}
                <TabsContent value="konsultanci" className="space-y-4">
                    <OnboardingPanel onboardingQueue={contractorOnboarding} entries={entries} />

                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold">Exit interviews — kolejka ({contractorExit.length})</h3>
                        <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50"><tr>
                                    <th className="p-2 text-left">Konsultant</th>
                                    <th className="p-2 text-left">Klient</th>
                                    <th className="p-2 text-left">Status</th>
                                    <th className="p-2 text-left">Zaplanowany</th>
                                </tr></thead>
                                <tbody>
                                    {contractorExit.map((x) => (
                                        <tr key={x.interview_id} className="border-t">
                                            <td className="p-2"><Link href={`/internal/kontraktorzy/${x.contractor_id}`} className="font-medium hover:text-primary hover:underline">{x.contractor_name}</Link></td>
                                            <td className="p-2">{x.client_snapshot ?? '—'}</td>
                                            <td className="p-2"><Badge variant="secondary">{INTERVIEW_STATUS_PL[x.status]}</Badge></td>
                                            <td className="p-2">{x.scheduled_for ?? '—'}</td>
                                        </tr>
                                    ))}
                                    {contractorExit.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Brak zaplanowanych exit interviews.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </TabsContent>
            </Tabs>
        </div>
    )
}
