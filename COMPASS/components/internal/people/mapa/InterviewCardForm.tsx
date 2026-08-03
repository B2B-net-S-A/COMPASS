'use client'

// Phase 46 — formularz karty rozmowy (blok A zawsze + rotacyjny B/C/D).
// Cel: wypełnienie < 3 minuty — selecty/radio/tag-pickery, minimum wolnego tekstu.
// Draft zapisywalny w każdej chwili; pełna matryca kompletności dopiero przy
// finalizacji (client-side pre-check + ponowna walidacja w akcji).

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import {
    createCardDraft,
    createClientArea,
    createClientForTechMap,
    createTechnologyUnverified,
    createVendorUnverified,
    finalizeCard,
    saveCard,
} from '@/lib/actions/tech-map'
import { validateCardForFinalize } from '@/lib/tech-map/validation'
import {
    HIRING_SOURCE_PL,
    HIRING_SOURCES,
    INITIATIVE_KIND_PL,
    INITIATIVE_KINDS,
    INITIATIVE_PRIORITY_PL,
    INTERVIEW_BLOCK_PL,
    INTERVIEW_BLOCKS,
    INTERVIEW_CARD_STATUS_PL,
    INTERVIEW_CARD_STATUSES,
    TECH_CATEGORY_PL,
    type CardInput,
    type ClientAreaRow,
    type HiringSource,
    type InitiativeInput,
    type InterviewBlock,
    type InterviewCardStatus,
    type TechnologyRow,
    type VendorRow,
} from '@/lib/types/tech-map'
import { TagMultiSelect, type TagOption } from './TagMultiSelect'

const selectCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm'

const MONTHS_PL = [
    'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

function localTodayISO(): string {
    return new Intl.DateTimeFormat('en-CA').format(new Date())
}

// ─── Wolne tagi (role, poza słownikiem) ─────────────────────────────────────

function FreeTagsInput({
    values,
    onChange,
    placeholder,
}: {
    values: string[]
    onChange: (v: string[]) => void
    placeholder?: string
}) {
    const [draft, setDraft] = useState('')

    function commit() {
        const v = draft.trim().replace(/,+$/, '')
        if (v && !values.includes(v)) onChange([...values, v])
        setDraft('')
    }

    return (
        <div className="space-y-2">
            {values.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {values.map((v) => (
                        <Badge key={v} variant="soft" size="sm">
                            {v}
                            <button
                                type="button"
                                onClick={() => onChange(values.filter((x) => x !== v))}
                                className="ml-1 opacity-60 hover:opacity-100"
                                aria-label={`Usuń ${v}`}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
            <Input
                value={draft}
                placeholder={placeholder ?? 'Wpisz i zatwierdź Enterem…'}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        commit()
                    }
                }}
            />
        </div>
    )
}

// ─── Formularz ──────────────────────────────────────────────────────────────

interface Props {
    mode: 'create' | 'edit'
    cardId?: string
    isDraft: boolean
    contractorId: string
    contractorName: string
    initial: CardInput
    clients: Array<{ id: string; name: string }>
    areas: ClientAreaRow[]
    technologies: TechnologyRow[]
    vendors: VendorRow[]
}

export function InterviewCardForm(props: Props) {
    const router = useRouter()
    const [saving, setSaving] = useState<'draft' | 'final' | null>(null)

    // Słowniki lokalne (rosną po „Dodaj klienta/obszar" bez round-tripu strony).
    const [clients, setClients] = useState(props.clients)
    const [areas, setAreas] = useState(props.areas)

    // Meta
    const [interviewDate, setInterviewDate] = useState(props.initial.interviewDate)
    const [clientId, setClientId] = useState(props.initial.clientId)
    const [clientAreaId, setClientAreaId] = useState<string | null>(props.initial.clientAreaId)
    const [block, setBlock] = useState<InterviewBlock>(props.initial.block)
    const [newClientName, setNewClientName] = useState<string | null>(null)
    const [newAreaName, setNewAreaName] = useState<string | null>(null)
    const [addingDict, setAddingDict] = useState(false)

    // Blok A
    const [status, setStatus] = useState<InterviewCardStatus | null>(props.initial.status)
    const [satisfaction, setSatisfaction] = useState<number | null>(props.initial.satisfaction)
    const [satisfactionComment, setSatisfactionComment] = useState(props.initial.satisfactionComment ?? '')
    const [projectEndMonth, setProjectEndMonth] = useState<number | null>(props.initial.projectEndMonth)
    const [projectEndYear, setProjectEndYear] = useState<number | null>(props.initial.projectEndYear)
    const [projectEndUnknown, setProjectEndUnknown] = useState(props.initial.projectEndUnknown)
    const [hiring, setHiring] = useState<boolean | null>(props.initial.hiring)
    const [hiringRoles, setHiringRoles] = useState<string[]>(props.initial.hiringRoles)
    const [hiringSource, setHiringSource] = useState<HiringSource | null>(props.initial.hiringSource)
    const [memorableQuote, setMemorableQuote] = useState(props.initial.memorableQuote ?? '')

    // Blok B
    const [technologyIds, setTechnologyIds] = useState<string[]>(props.initial.technologyIds)
    const [techOldNew, setTechOldNew] = useState(props.initial.techOldNew ?? '')
    const [teamSize, setTeamSize] = useState<string>(props.initial.teamSize?.toString() ?? '')
    const [teamExternals, setTeamExternals] = useState<string>(props.initial.teamExternals?.toString() ?? '')

    // Blok C
    const [initiatives, setInitiatives] = useState<InitiativeInput[]>(props.initial.initiatives)

    // Blok D
    const [vendorIds, setVendorIds] = useState<string[]>(props.initial.vendorIds)
    const [vendorsNote, setVendorsNote] = useState(props.initial.vendorsNote ?? '')

    const areasForClient = useMemo(
        () => areas.filter((a) => a.client_id === clientId),
        [areas, clientId],
    )

    const techOptions = useMemo<TagOption[]>(
        () =>
            props.technologies.map((t) => ({
                id: t.id,
                label: t.name,
                hint: TECH_CATEGORY_PL[t.category],
                aliases: t.aliases,
                unverified: !t.is_verified,
            })),
        [props.technologies],
    )
    const vendorOptions = useMemo<TagOption[]>(
        () =>
            props.vendors.map((v) => ({ id: v.id, label: v.name, unverified: !v.is_verified })),
        [props.vendors],
    )

    const yearNow = new Date().getFullYear()
    const yearOptions = [yearNow - 1, yearNow, yearNow + 1, yearNow + 2, yearNow + 3]

    function buildInput(): CardInput {
        return {
            contractorId: props.contractorId,
            clientId,
            clientAreaId,
            interviewDate,
            block,
            status,
            satisfaction,
            satisfactionComment: satisfactionComment || null,
            projectEndMonth,
            projectEndYear,
            projectEndUnknown,
            hiring,
            hiringRoles,
            hiringSource,
            memorableQuote: memorableQuote || null,
            techOldNew: techOldNew || null,
            teamSize: teamSize === '' ? null : Number.parseInt(teamSize, 10),
            teamExternals: teamExternals === '' ? null : Number.parseInt(teamExternals, 10),
            vendorsNote: vendorsNote || null,
            technologyIds,
            vendorIds,
            initiatives,
        }
    }

    async function addClient() {
        const name = (newClientName ?? '').trim()
        if (name.length < 2) {
            toast.error('Podaj nazwę klienta.')
            return
        }
        setAddingDict(true)
        try {
            const created = await createClientForTechMap(name)
            setClients((prev) =>
                prev.some((c) => c.id === created.id)
                    ? prev
                    : [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'pl')),
            )
            setClientId(created.id)
            setClientAreaId(null)
            setNewClientName(null)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się dodać klienta.')
        } finally {
            setAddingDict(false)
        }
    }

    async function addArea() {
        const name = (newAreaName ?? '').trim()
        if (!clientId) {
            toast.error('Najpierw wybierz klienta.')
            return
        }
        if (name.length < 2) {
            toast.error('Podaj nazwę obszaru.')
            return
        }
        setAddingDict(true)
        try {
            const created = await createClientArea(clientId, name)
            setAreas((prev) => (prev.some((a) => a.id === created.id) ? prev : [...prev, created]))
            setClientAreaId(created.id)
            setNewAreaName(null)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się dodać obszaru.')
        } finally {
            setAddingDict(false)
        }
    }

    async function submit(kind: 'draft' | 'final') {
        const input = buildInput()
        if (!input.clientId) {
            toast.error('Wybierz klienta.')
            return
        }
        if (kind === 'final') {
            const errors = validateCardForFinalize(input, localTodayISO())
            if (errors.length > 0) {
                toast.error(errors[0])
                return
            }
        }
        setSaving(kind)
        try {
            if (props.mode === 'create') {
                const { id } = await createCardDraft(input)
                if (kind === 'final') {
                    await finalizeCard(id, input)
                    toast.success('Karta sfinalizowana.')
                    router.push('/internal/people?tab=mapa')
                } else {
                    toast.success('Zapisano wersję roboczą.')
                    router.replace(`/internal/people/mapa/karta/${id}`)
                }
            } else {
                if (kind === 'final') {
                    await finalizeCard(props.cardId!, input)
                    toast.success(props.isDraft ? 'Karta sfinalizowana.' : 'Zapisano zmiany.')
                    router.push('/internal/people?tab=mapa')
                } else {
                    await saveCard(props.cardId!, input)
                    toast.success('Zapisano.')
                    router.refresh()
                }
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać karty.')
        } finally {
            setSaving(null)
        }
    }

    const disabled = saving !== null || addingDict

    return (
        <div className="space-y-6">
            {/* ─── Meta ─────────────────────────────────────────────────── */}
            <section className="rounded-lg border border-border bg-card p-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                        <Label>Data rozmowy</Label>
                        <Input
                            type="date"
                            value={interviewDate}
                            onChange={(e) => setInterviewDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Konsultant</Label>
                        <Input value={props.contractorName} disabled />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Klient</Label>
                        {newClientName === null ? (
                            <select
                                className={selectCls}
                                value={clientId}
                                onChange={(e) => {
                                    if (e.target.value === '__new__') {
                                        setNewClientName('')
                                        return
                                    }
                                    setClientId(e.target.value)
                                    setClientAreaId(null)
                                }}
                            >
                                <option value="">— wybierz klienta —</option>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                                <option value="__new__">+ Dodaj nowego klienta…</option>
                            </select>
                        ) : (
                            <div className="flex gap-2">
                                <Input
                                    autoFocus
                                    value={newClientName}
                                    placeholder="Nazwa klienta"
                                    onChange={(e) => setNewClientName(e.target.value)}
                                />
                                <Button type="button" size="sm" onClick={addClient} disabled={addingDict}>
                                    {addingDict ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dodaj'}
                                </Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => setNewClientName(null)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <Label>Departament / obszar</Label>
                        {newAreaName === null ? (
                            <select
                                className={selectCls}
                                value={clientAreaId ?? ''}
                                disabled={!clientId}
                                onChange={(e) => {
                                    if (e.target.value === '__new__') {
                                        setNewAreaName('')
                                        return
                                    }
                                    setClientAreaId(e.target.value || null)
                                }}
                            >
                                <option value="">— brak / cały klient —</option>
                                {areasForClient.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                                <option value="__new__">+ Dodaj obszar…</option>
                            </select>
                        ) : (
                            <div className="flex gap-2">
                                <Input
                                    autoFocus
                                    value={newAreaName}
                                    placeholder="Nazwa obszaru"
                                    onChange={(e) => setNewAreaName(e.target.value)}
                                />
                                <Button type="button" size="sm" onClick={addArea} disabled={addingDict}>
                                    {addingDict ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dodaj'}
                                </Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => setNewAreaName(null)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label>Wykonany blok</Label>
                    <div className="flex flex-wrap gap-2">
                        {INTERVIEW_BLOCKS.map((b) => (
                            <button
                                key={b}
                                type="button"
                                onClick={() => setBlock(b)}
                                className={
                                    block === b
                                        ? 'rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary'
                                        : 'rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted'
                                }
                            >
                                {b} — {INTERVIEW_BLOCK_PL[b]}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── Blok A ───────────────────────────────────────────────── */}
            <section className="rounded-lg border border-border bg-card p-4 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Blok A — zawsze
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Status rozmowy</Label>
                        <select
                            className={selectCls}
                            value={status ?? ''}
                            onChange={(e) => setStatus((e.target.value || null) as InterviewCardStatus | null)}
                        >
                            <option value="">— wybierz —</option>
                            {INTERVIEW_CARD_STATUSES.map((s) => (
                                <option key={s} value={s}>{INTERVIEW_CARD_STATUS_PL[s]}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Satysfakcja (1–5)</Label>
                        <div className="flex gap-1.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => setSatisfaction(satisfaction === n ? null : n)}
                                    className={
                                        satisfaction === n
                                            ? 'h-9 w-9 rounded-md border border-primary bg-primary/10 text-sm font-semibold text-primary'
                                            : 'h-9 w-9 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted'
                                    }
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                {satisfaction !== null && satisfaction <= 3 && (
                    <div className="space-y-1.5">
                        <Label>Komentarz do satysfakcji (wymagany przy ≤3)</Label>
                        <Textarea
                            rows={2}
                            value={satisfactionComment}
                            onChange={(e) => setSatisfactionComment(e.target.value)}
                            placeholder="Co jest nie tak? Co można poprawić?"
                        />
                    </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Koniec projektu</Label>
                        <div className="flex items-center gap-2">
                            <select
                                className={selectCls}
                                value={projectEndMonth ?? ''}
                                disabled={projectEndUnknown}
                                onChange={(e) =>
                                    setProjectEndMonth(e.target.value ? Number.parseInt(e.target.value, 10) : null)
                                }
                            >
                                <option value="">— miesiąc —</option>
                                {MONTHS_PL.map((m, i) => (
                                    <option key={m} value={i + 1}>{m}</option>
                                ))}
                            </select>
                            <select
                                className={selectCls}
                                value={projectEndYear ?? ''}
                                disabled={projectEndUnknown}
                                onChange={(e) =>
                                    setProjectEndYear(e.target.value ? Number.parseInt(e.target.value, 10) : null)
                                }
                            >
                                <option value="">— rok —</option>
                                {yearOptions.map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={projectEndUnknown}
                                onChange={(e) => {
                                    setProjectEndUnknown(e.target.checked)
                                    if (e.target.checked) {
                                        setProjectEndMonth(null)
                                        setProjectEndYear(null)
                                    }
                                }}
                            />
                            Nie wie
                        </label>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Czy szukają ludzi?</Label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setHiring(hiring === true ? null : true)}
                                className={
                                    hiring === true
                                        ? 'rounded-md border border-green-500 bg-green-50 px-4 py-1.5 text-sm font-semibold text-green-700'
                                        : 'rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted'
                                }
                            >
                                Tak
                            </button>
                            <button
                                type="button"
                                onClick={() => setHiring(hiring === false ? null : false)}
                                className={
                                    hiring === false
                                        ? 'rounded-md border border-primary bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary'
                                        : 'rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted'
                                }
                            >
                                Nie
                            </button>
                        </div>
                    </div>
                </div>
                {hiring === true && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Jakie role?</Label>
                            <FreeTagsInput
                                values={hiringRoles}
                                onChange={setHiringRoles}
                                placeholder="np. Java Developer, Enter dodaje"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Źródło: Widział / Słyszał / Plotka</Label>
                            <div className="flex gap-2">
                                {HIRING_SOURCES.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setHiringSource(s)}
                                        className={
                                            hiringSource === s
                                                ? 'rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary'
                                                : 'rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted'
                                        }
                                    >
                                        {HIRING_SOURCE_PL[s]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                <div className="space-y-1.5">
                    <Label>Jedno zdanie warte zapamiętania</Label>
                    <Input
                        value={memorableQuote}
                        onChange={(e) => setMemorableQuote(e.target.value)}
                        placeholder="Najważniejsza rzecz z tej rozmowy"
                    />
                </div>
            </section>

            {/* ─── Blok rotacyjny ───────────────────────────────────────── */}
            {block === 'B' && (
                <section className="rounded-lg border border-border bg-card p-4 space-y-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Blok B — technologie i zespół
                    </h2>
                    <div className="space-y-1.5">
                        <Label>Technologie</Label>
                        <TagMultiSelect
                            options={techOptions}
                            selectedIds={technologyIds}
                            onChange={setTechnologyIds}
                            placeholder="Szukaj technologii (np. k8s, Java)…"
                            onCreate={async (name) => {
                                const row = await createTechnologyUnverified(name)
                                return {
                                    id: row.id,
                                    label: row.name,
                                    hint: TECH_CATEGORY_PL[row.category],
                                    aliases: row.aliases,
                                    unverified: !row.is_verified,
                                }
                            }}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Co stare, co nowe?</Label>
                        <Textarea
                            rows={2}
                            value={techOldNew}
                            onChange={(e) => setTechOldNew(e.target.value)}
                            placeholder="Z czego schodzą, na co przechodzą"
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Wielkość zespołu</Label>
                            <Input
                                type="number"
                                min={0}
                                value={teamSize}
                                onChange={(e) => setTeamSize(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>W tym zewnętrznych</Label>
                            <Input
                                type="number"
                                min={0}
                                value={teamExternals}
                                onChange={(e) => setTeamExternals(e.target.value)}
                            />
                        </div>
                    </div>
                </section>
            )}

            {block === 'C' && (
                <section className="rounded-lg border border-border bg-card p-4 space-y-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Blok C — inicjatywy / projekty
                    </h2>
                    {initiatives.length === 0 && (
                        <p className="text-sm text-muted-foreground">Brak inicjatyw — dodaj pierwszą.</p>
                    )}
                    <div className="space-y-2">
                        {initiatives.map((ini, idx) => (
                            <div key={idx} className="flex flex-wrap items-center gap-2">
                                <Input
                                    className="flex-1 min-w-[180px]"
                                    value={ini.name}
                                    placeholder="Nazwa inicjatywy"
                                    onChange={(e) =>
                                        setInitiatives((prev) =>
                                            prev.map((p, i) => (i === idx ? { ...p, name: e.target.value } : p)),
                                        )
                                    }
                                />
                                <select
                                    className={`${selectCls} w-auto`}
                                    value={ini.kind}
                                    onChange={(e) =>
                                        setInitiatives((prev) =>
                                            prev.map((p, i) =>
                                                i === idx ? { ...p, kind: e.target.value as InitiativeInput['kind'] } : p,
                                            ),
                                        )
                                    }
                                >
                                    {INITIATIVE_KINDS.map((k) => (
                                        <option key={k} value={k}>{INITIATIVE_KIND_PL[k]}</option>
                                    ))}
                                </select>
                                <select
                                    className={`${selectCls} w-auto`}
                                    value={ini.priority}
                                    onChange={(e) =>
                                        setInitiatives((prev) =>
                                            prev.map((p, i) =>
                                                i === idx
                                                    ? { ...p, priority: e.target.value as InitiativeInput['priority'] }
                                                    : p,
                                            ),
                                        )
                                    }
                                >
                                    {(['wysoki', 'normalny'] as const).map((p) => (
                                        <option key={p} value={p}>{INITIATIVE_PRIORITY_PL[p]}</option>
                                    ))}
                                </select>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setInitiatives((prev) => prev.filter((_, i) => i !== idx))}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            setInitiatives((prev) => [...prev, { name: '', kind: 'inne', priority: 'normalny' }])
                        }
                    >
                        <Plus className="mr-1 h-4 w-4" /> Dodaj inicjatywę
                    </Button>
                </section>
            )}

            {block === 'D' && (
                <section className="rounded-lg border border-border bg-card p-4 space-y-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Blok D — inne firmy (dostawcy)
                    </h2>
                    <div className="space-y-1.5">
                        <Label>Inne firmy (dostawcy)</Label>
                        <TagMultiSelect
                            options={vendorOptions}
                            selectedIds={vendorIds}
                            onChange={setVendorIds}
                            placeholder="Szukaj dostawcy…"
                            onCreate={async (name) => {
                                const row = await createVendorUnverified(name)
                                return { id: row.id, label: row.name, unverified: !row.is_verified }
                            }}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Notatka o dostawcach</Label>
                        <Textarea
                            rows={2}
                            value={vendorsNote}
                            onChange={(e) => setVendorsNote(e.target.value)}
                            placeholder="Kto, w jakim obszarze, jak duża obecność"
                        />
                    </div>
                </section>
            )}

            {/* ─── Akcje ────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => submit('final')} disabled={disabled}>
                    {saving === 'final' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {props.isDraft || props.mode === 'create' ? 'Finalizuj kartę' : 'Zapisz zmiany'}
                </Button>
                {(props.mode === 'create' || props.isDraft) && (
                    <Button type="button" variant="outline" onClick={() => submit('draft')} disabled={disabled}>
                        {saving === 'draft' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Zapisz wersję roboczą
                    </Button>
                )}
                {!props.isDraft && props.mode === 'edit' && (
                    <Badge variant="success" size="sm">Sfinalizowana</Badge>
                )}
            </div>
        </div>
    )
}
