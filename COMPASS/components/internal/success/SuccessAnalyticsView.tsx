'use client'

import { useMemo } from 'react'
import { AlertTriangle, CalendarCheck, CheckCircle2, ClipboardCheck, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { StatCard, StatCardGrid } from '@/components/ds/StatCard'
import { Badge } from '@/components/ui/badge'
import type { SuccessCheckInListItem, SuccessConsultantListItem, SuccessDashboard } from '@/lib/types/consultant-success'

const COLORS = {
    green: 'hsl(var(--success))',
    amber: 'hsl(var(--warning))',
    red: 'hsl(var(--destructive))',
    unknown: 'hsl(var(--muted-foreground))',
    primary: 'hsl(var(--primary))',
}

function daysSince(value: string | null): number | null {
    if (!value) return null
    return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)
}

export function SuccessAnalyticsView({
    dashboard,
    consultants,
    checkIns,
}: {
    dashboard: SuccessDashboard
    consultants: SuccessConsultantListItem[]
    checkIns: SuccessCheckInListItem[]
}) {
    const analytics = useMemo(() => {
        const monitored = consultants.filter((item) => item.monitoringState === 'active')
        const contact30 = monitored.filter((item) => { const days = daysSince(item.lastContactAt); return days !== null && days <= 30 }).length
        const contact60 = monitored.filter((item) => { const days = daysSince(item.lastContactAt); return days !== null && days > 30 && days <= 60 }).length
        const contactLate = monitored.length - contact30 - contact60
        const completed = checkIns.filter((item) => item.status === 'completed').length
        const open = checkIns.filter((item) => item.status === 'scheduled' || item.status === 'in_progress')
        const overdue = open.filter((item) => new Date(item.scheduledAt).getTime() < Date.now()).length
        const completionRate = checkIns.length > 0 ? Math.round((completed / checkIns.length) * 100) : 0
        const taskOpen = consultants.reduce((sum, item) => sum + item.openTaskCount, 0)
        const taskOverdue = consultants.reduce((sum, item) => sum + item.overdueTaskCount, 0)

        const clientMap = new Map<string, { client: string; green: number; amber: number; red: number; unknown: number; total: number }>()
        const ownerMap = new Map<string, { owner: string; monitored: number; attention: number; overdueActions: number }>()
        for (const consultant of consultants) {
            const client = consultant.currentClient ?? 'Bez klienta'
            const clientRow = clientMap.get(client) ?? { client, green: 0, amber: 0, red: 0, unknown: 0, total: 0 }
            clientRow[consultant.health.status] += 1
            clientRow.total += 1
            clientMap.set(client, clientRow)

            const owner = consultant.ownerTcmName ?? 'Bez opiekuna'
            const ownerRow = ownerMap.get(owner) ?? { owner, monitored: 0, attention: 0, overdueActions: 0 }
            if (consultant.monitoringState === 'active') ownerRow.monitored += 1
            if (consultant.health.status === 'amber' || consultant.health.status === 'red') ownerRow.attention += 1
            ownerRow.overdueActions += consultant.overdueTaskCount
            ownerMap.set(owner, ownerRow)
        }

        return {
            monitored,
            contactCoverage: monitored.length > 0 ? Math.round((contact30 / monitored.length) * 100) : 0,
            contactBuckets: [
                { label: 'do 30 dni', count: contact30 },
                { label: '31–60 dni', count: contact60 },
                { label: '>60 dni / brak', count: contactLate },
            ],
            completionRate,
            completed,
            overdue,
            taskOpen,
            taskOverdue,
            byClient: Array.from(clientMap.values()).sort((a, b) => b.total - a.total).slice(0, 10),
            byOwner: Array.from(ownerMap.values()).sort((a, b) => b.monitored - a.monitored),
        }
    }, [checkIns, consultants])

    const healthData = (['green', 'amber', 'red', 'unknown'] as const).map((status) => ({
        status,
        label: status === 'green' ? 'Zielony' : status === 'amber' ? 'Żółty' : status === 'red' ? 'Czerwony' : 'Bez statusu',
        value: dashboard.healthDistribution.find((item) => item.status === status)?.count ?? 0,
    }))

    return (
        <div className="space-y-6">
            <StatCardGrid>
                <StatCard label="Pokrycie kontaktu ≤30 dni" value={`${analytics.contactCoverage}%`} sub={`${analytics.monitored.length} osób w aktywnym monitoringu`} icon={Users} />
                <StatCard label="Ukończone check-iny" value={`${analytics.completionRate}%`} sub={`${analytics.completed} z ${checkIns.length} zapisanych`} icon={CheckCircle2} />
                <StatCard label="Check-iny po terminie" value={analytics.overdue} sub="otwarte i przeterminowane" icon={CalendarCheck} className={analytics.overdue > 0 ? 'border-destructive/30' : undefined} />
                <StatCard label="Action steps po terminie" value={analytics.taskOverdue} sub={`${analytics.taskOpen} wszystkich otwartych`} icon={ClipboardCheck} className={analytics.taskOverdue > 0 ? 'border-warning/30' : undefined} />
            </StatCardGrid>

            <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard title="Status relacji" description="Ręczna ocena TCM — bez wyniku punktowego.">
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart><Pie data={healthData} dataKey="value" nameKey="label" innerRadius={55} outerRadius={95} paddingAngle={3}>{healthData.map((item) => <Cell key={item.status} fill={COLORS[item.status]} />)}</Pie><Tooltip /><Legend /></PieChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                <ChartCard title="Świeżość kontaktu" description="Liczba aktywnie monitorowanych konsultantów według ostatniego kontaktu.">
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.contactBuckets} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" name="Konsultanci" fill={COLORS.primary} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
                    </div>
                </ChartCard>
            </div>

            {dashboard.healthHistory.length > 0 ? (
                <ChartCard title="Statusy relacji na koniec okresu" description="Ostatni znany status każdego zmierzonego konsultanta na koniec miesiąca (snapshot, nie liczba zmian).">
                    <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.healthHistory} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="period" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip /><Legend /><Bar stackId="health" dataKey="green" name="Zielone" fill={COLORS.green} /><Bar stackId="health" dataKey="amber" name="Żółte" fill={COLORS.amber} /><Bar stackId="health" dataKey="red" name="Czerwone" fill={COLORS.red} /><Bar stackId="health" dataKey="unknown" name="Bez statusu" fill={COLORS.unknown} /></BarChart></ResponsiveContainer></div>
                </ChartCard>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border p-5"><h2 className="font-semibold">Klienci wymagający uwagi</h2><p className="mt-1 text-sm text-muted-foreground">Rozkład ręcznych statusów dla aktywnego portfolio.</p></div>
                    <div className="divide-y divide-border">{analytics.byClient.map((row) => <div key={row.client} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.client}</p><p className="text-xs text-muted-foreground">{row.total} konsultantów</p></div><div className="flex gap-1"><Badge variant="success">{row.green}</Badge><Badge variant="warning">{row.amber}</Badge><Badge variant="danger">{row.red}</Badge></div></div>)}</div>
                </section>
                <section className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border p-5"><h2 className="font-semibold">Obciążenie zespołu TCM</h2><p className="mt-1 text-sm text-muted-foreground">Monitoring, relacje do uwagi i zaległe działania.</p></div>
                    <div className="divide-y divide-border">{analytics.byOwner.map((row) => <div key={row.owner} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 p-4 text-sm"><span className="truncate font-medium">{row.owner}</span><span className="text-center"><strong>{row.monitored}</strong><small className="block text-muted-foreground">monitoring</small></span><span className="text-center"><strong>{row.attention}</strong><small className="block text-muted-foreground">uwaga</small></span><span className="text-center"><strong>{row.overdueActions}</strong><small className="block text-muted-foreground">po terminie</small></span></div>)}</div>
                </section>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/25 p-4 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Analityka pokazuje operacyjne sygnały i ręczne statusy TCM. Nie wylicza automatycznego health score konsultanta.</p></div>
        </div>
    )
}

function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
    return <section className="rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p><div className="mt-4">{children}</div></section>
}
