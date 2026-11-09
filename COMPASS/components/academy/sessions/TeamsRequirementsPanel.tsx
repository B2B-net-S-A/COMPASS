/** Spis do decyzji właściciela. Aplikacja niczego z tego nie nadaje; opis stanu: docs/academy/graph-readiness.md. */
export const ACADEMY_TEAMS_GRAPH_ROLES = [
    { role: 'Calendars.ReadWrite', use: 'Tworzenie i zmiana spotkania w kalendarzu gospodarza.' },
    { role: 'OnlineMeetings.Read.All', use: 'Odczyt spotkania online potrzebny do pobrania raportu.' },
    { role: 'OnlineMeetingArtifact.Read.All', use: 'Odczyt raportu obecności ze spotkania.' },
] as const

export function TeamsRequirementsPanel({ enabled }: { enabled: boolean }) {
    return <section aria-label="Wymagane uprawnienia Teams" className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1">
            <h2 className="font-semibold">Wymagane uprawnienia Microsoft Graph</h2>
            <p className="text-sm text-muted-foreground">{enabled ? 'Tor firmowych spotkań jest włączony.' : 'Tor firmowych spotkań jest wyłączony przełącznikiem. Domyślny sposób to spotkanie z linkiem.'} Uprawnienia nadaje wyłącznie właściciel, ta strona ich nie zmienia.</p>
        </div>
        <ul className="divide-y divide-border text-sm">{ACADEMY_TEAMS_GRAPH_ROLES.map(item => <li key={item.role} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between sm:gap-4"><code className="font-mono text-xs">{item.role}</code><span className="text-muted-foreground sm:text-right">{item.use}</span></li>)}</ul>
        <p className="text-xs text-muted-foreground">Same role nie wystarczą: dochodzi Teams application access policy dla gospodarza i dostęp w Exchange.</p>
    </section>
}
