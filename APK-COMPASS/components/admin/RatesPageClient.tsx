'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import {
    Loader2,
    Search,
    TrendingUp,
    TrendingDown,
    Minus,
    History,
    Database,
    ArrowRight,
    Filter,
    Sparkles,
} from 'lucide-react'
import { verifyRate, getMarketRates } from '@/lib/actions/rates'

interface MarketRate {
    id: string
    position_title: string
    category: string | null
    seniority: string | null
    rate_min: number
    rate_median: number | null
    rate_max: number
    currency: string
    rate_type: string
    source: string | null
    region: string | null
}

interface RateVerification {
    id: string
    position_title: string
    profile_description: string | null
    expected_rate: number
    currency: string
    rate_type: string
    market_rate_min: number | null
    market_rate_max: number | null
    market_rate_median: number | null
    market_sources: string[] | null
    compass_rate_min: number | null
    compass_rate_max: number | null
    compass_rate_avg: number | null
    compass_sample_size: number
    verdict: string | null
    notes: string | null
    created_at: string
}

interface VerifyResult {
    market: { min: number | null; median: number | null; max: number | null; sources: string[]; count: number }
    compass: { min: number | null; avg: number | null; max: number | null; sample_size: number }
    verdict: 'below_market' | 'within_market' | 'above_market'
    expected_rate: number
    rate_type: string
    summary: string
}

interface RatesPageClientProps {
    initialMarketRates: MarketRate[]
    categories: string[]
    sources: string[]
    initialHistory: RateVerification[]
    isAdmin: boolean
}

const VERDICT_CONFIG = {
    below_market: { label: 'Poniżej rynku', icon: TrendingDown, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
    within_market: { label: 'W normie rynkowej', icon: Minus, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
    above_market: { label: 'Powyżej rynku', icon: TrendingUp, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
}

const RATE_TYPE_LABELS: Record<string, string> = {
    'hourly': 'PLN/h',
    'monthly': 'PLN/mies.',
    'monthly_gross_uop': 'PLN/mies. brutto (UoP)',
    'monthly_b2b_netto': 'PLN/mies. netto (B2B)',
    'hourly_b2b_netto': 'PLN/h netto (B2B)',
}

export function RatesPageClient({ initialMarketRates, categories, sources, initialHistory, isAdmin }: RatesPageClientProps) {
    const [activeTab, setActiveTab] = useState<'verify' | 'database' | 'history'>('verify')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<VerifyResult | null>(null)

    // Verification form
    const [positionTitle, setPositionTitle] = useState('')
    const [profileDescription, setProfileDescription] = useState('')
    const [expectedRate, setExpectedRate] = useState('')
    const [rateType, setRateType] = useState<'hourly' | 'monthly'>('hourly')

    // Database filters
    const [filterCategory, setFilterCategory] = useState<string>('all')
    const [filterSource, setFilterSource] = useState<string>('all')
    const [filterSearch, setFilterSearch] = useState('')
    const [marketRates, setMarketRates] = useState(initialMarketRates)
    const [dbLoading, setDbLoading] = useState(false)

    // History
    const [history] = useState(initialHistory)

    const handleVerify = async () => {
        if (!positionTitle.trim()) {
            toast.error('Wpisz nazwę stanowiska')
            return
        }
        if (!expectedRate || Number(expectedRate) <= 0) {
            toast.error('Wpisz oczekiwaną stawkę')
            return
        }

        setLoading(true)
        setResult(null)
        try {
            const res = await verifyRate({
                position_title: positionTitle.trim(),
                profile_description: profileDescription.trim() || undefined,
                expected_rate: Number(expectedRate),
                rate_type: rateType,
            })
            setResult(res)
            toastSuccess('Weryfikacja zakończona')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Błąd weryfikacji')
        } finally {
            setLoading(false)
        }
    }

    const handleFilterRates = async () => {
        setDbLoading(true)
        try {
            const filters: { category?: string; source?: string; search?: string } = {}
            if (filterCategory && filterCategory !== 'all') filters.category = filterCategory
            if (filterSource && filterSource !== 'all') filters.source = filterSource
            if (filterSearch) filters.search = filterSearch
            const data = await getMarketRates(filters)
            setMarketRates(data)
        } catch {
            toast.error('Błąd filtrowania')
        } finally {
            setDbLoading(false)
        }
    }

    const tabs = [
        { key: 'verify' as const, label: 'Weryfikacja stawki', icon: Search },
        { key: 'database' as const, label: 'Baza stawek rynkowych', icon: Database },
        { key: 'history' as const, label: 'Historia weryfikacji', icon: History },
    ]

    return (
        <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-muted/30 rounded-lg w-fit">
                {tabs.map(tab => {
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                activeTab === tab.key
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {/* Tab: Verification */}
            {activeTab === 'verify' && (
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Form */}
                    <div className="rounded-lg border border-white/10 bg-card p-6 space-y-5">
                        <h2 className="text-lg font-semibold">Sprawdź stawkę</h2>

                        <div className="space-y-2">
                            <Label htmlFor="position">Nazwa stanowiska *</Label>
                            <Input
                                id="position"
                                placeholder="np. Java Developer, DevOps Engineer, SAP Consultant..."
                                value={positionTitle}
                                onChange={e => setPositionTitle(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Opis profilu (opcjonalny)</Label>
                            <Textarea
                                id="description"
                                placeholder="Dodatkowe wymagania, technologie, doświadczenie..."
                                value={profileDescription}
                                onChange={e => setProfileDescription(e.target.value)}
                                rows={3}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="rate">Oczekiwana stawka (PLN) *</Label>
                                <Input
                                    id="rate"
                                    type="number"
                                    placeholder={rateType === 'hourly' ? 'np. 150' : 'np. 25000'}
                                    value={expectedRate}
                                    onChange={e => setExpectedRate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Typ stawki</Label>
                                <Select value={rateType} onValueChange={v => setRateType(v as 'hourly' | 'monthly')}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="hourly">Godzinowa (PLN/h)</SelectItem>
                                        <SelectItem value="monthly">Miesięczna (PLN/mies.)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <Button onClick={handleVerify} disabled={loading} className="w-full">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                            Weryfikuj stawkę
                        </Button>
                    </div>

                    {/* Result */}
                    <div className="rounded-lg border border-white/10 bg-card p-6">
                        {!result && !loading && (
                            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-12">
                                <TrendingUp className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-sm">Wpisz stanowisko i stawkę, aby zobaczyć porównanie z rynkiem</p>
                            </div>
                        )}

                        {loading && (
                            <div className="flex flex-col items-center justify-center h-full py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                                <p className="text-sm text-muted-foreground">Analizuję dane...</p>
                            </div>
                        )}

                        {result && (
                            <div className="space-y-6">
                                {/* Verdict */}
                                <div className={`flex items-center gap-3 p-4 rounded-lg border ${VERDICT_CONFIG[result.verdict].bg}`}>
                                    {(() => {
                                        const Icon = VERDICT_CONFIG[result.verdict].icon
                                        return <Icon className={`h-6 w-6 ${VERDICT_CONFIG[result.verdict].color}`} />
                                    })()}
                                    <div>
                                        <p className={`text-lg font-semibold ${VERDICT_CONFIG[result.verdict].color}`}>
                                            {VERDICT_CONFIG[result.verdict].label}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Twoja stawka: <strong>{result.expected_rate} PLN/{result.rate_type === 'hourly' ? 'h' : 'mies.'}</strong>
                                        </p>
                                    </div>
                                </div>

                                {/* Market rates */}
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Stawki rynkowe</h3>
                                    {result.market.count > 0 ? (
                                        <div className="grid grid-cols-3 gap-3">
                                            <RateCard label="Minimum" value={result.market.min} suffix={result.rate_type === 'hourly' ? 'PLN/h' : 'PLN/mies.'} />
                                            <RateCard label="Mediana" value={result.market.median} suffix={result.rate_type === 'hourly' ? 'PLN/h' : 'PLN/mies.'} highlight />
                                            <RateCard label="Maksimum" value={result.market.max} suffix={result.rate_type === 'hourly' ? 'PLN/h' : 'PLN/mies.'} />
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic">Brak danych rynkowych dla tego stanowiska</p>
                                    )}
                                    {result.market.sources.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {result.market.sources.map(s => (
                                                <Badge key={s} variant="outline" className="text-xs">
                                                    {s}
                                                </Badge>
                                            ))}
                                            <span className="text-xs text-muted-foreground ml-1">
                                                ({result.market.count} dopasowań)
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Compass rates */}
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Stawki w Compass</h3>
                                    {result.compass.sample_size > 0 ? (
                                        <>
                                            <div className="grid grid-cols-3 gap-3">
                                                <RateCard label="Minimum" value={result.compass.min} suffix={result.rate_type === 'hourly' ? 'PLN/h' : 'PLN/mies.'} />
                                                <RateCard label="Średnia" value={result.compass.avg} suffix={result.rate_type === 'hourly' ? 'PLN/h' : 'PLN/mies.'} highlight />
                                                <RateCard label="Maksimum" value={result.compass.max} suffix={result.rate_type === 'hourly' ? 'PLN/h' : 'PLN/mies.'} />
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Na podstawie {result.compass.sample_size} aktywnych kontraktów w systemie
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic">Brak aktywnych kontraktów w systemie</p>
                                    )}
                                </div>

                                {/* Visual comparison bar */}
                                {result.market.min !== null && result.market.max !== null && (
                                    <RateComparisonBar
                                        min={result.market.min}
                                        max={result.market.max}
                                        median={result.market.median}
                                        userRate={result.expected_rate}
                                        compassAvg={result.compass.avg}
                                    />
                                )}

                                {/* AI Summary */}
                                {result.summary && (
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                            <Sparkles className="h-4 w-4 text-amber-400" />
                                            Podsumowanie i wnioski AI
                                        </h3>
                                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                                            <p className="text-sm leading-relaxed whitespace-pre-line">{result.summary}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tab: Database */}
            {activeTab === 'database' && (
                <div className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="space-y-1">
                            <Label className="text-xs">Kategoria</Label>
                            <Select value={filterCategory} onValueChange={setFilterCategory}>
                                <SelectTrigger className="w-48">
                                    <SelectValue placeholder="Wszystkie" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Wszystkie</SelectItem>
                                    {categories.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Źródło</Label>
                            <Select value={filterSource} onValueChange={setFilterSource}>
                                <SelectTrigger className="w-64">
                                    <SelectValue placeholder="Wszystkie" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Wszystkie</SelectItem>
                                    {sources.map(s => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Szukaj</Label>
                            <Input
                                placeholder="Nazwa stanowiska..."
                                value={filterSearch}
                                onChange={e => setFilterSearch(e.target.value)}
                                className="w-56"
                            />
                        </div>
                        <Button onClick={handleFilterRates} disabled={dbLoading} size="sm" variant="outline">
                            {dbLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4 mr-1" />}
                            Filtruj
                        </Button>
                    </div>

                    {/* Count */}
                    <p className="text-sm text-muted-foreground">
                        {marketRates.length} stanowisk w bazie
                    </p>

                    {/* Table */}
                    <div className="rounded-lg border border-white/10 overflow-auto max-h-[600px]">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-card z-10">
                                <tr className="border-b border-white/10">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Stanowisko</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Kategoria</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Poziom</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Min</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Mediana</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Max</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Typ</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Źródło</th>
                                </tr>
                            </thead>
                            <tbody>
                                {marketRates.map((rate, i) => (
                                    <tr
                                        key={rate.id}
                                        className={`border-b border-white/5 last:border-0 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/5'}`}
                                    >
                                        <td className="px-4 py-2.5 font-medium">{rate.position_title}</td>
                                        <td className="px-4 py-2.5 text-muted-foreground">{rate.category || '—'}</td>
                                        <td className="px-4 py-2.5">
                                            {rate.seniority && (
                                                <Badge variant="outline" className="text-xs">{rate.seniority}</Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(rate.rate_min)}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{rate.rate_median ? formatNumber(rate.rate_median) : '—'}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(rate.rate_max)}</td>
                                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{RATE_TYPE_LABELS[rate.rate_type] || rate.rate_type}</td>
                                        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{rate.source || '—'}</td>
                                    </tr>
                                ))}
                                {marketRates.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                                            Brak danych w bazie stawek rynkowych
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tab: History */}
            {activeTab === 'history' && (
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Ostatnie {history.length} weryfikacji
                    </p>

                    <div className="space-y-3">
                        {history.map(item => {
                            const verdictConf = item.verdict ? VERDICT_CONFIG[item.verdict as keyof typeof VERDICT_CONFIG] : null
                            return (
                                <div key={item.id} className="rounded-lg border border-white/10 bg-card p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium">{item.position_title}</h3>
                                                {verdictConf && (
                                                    <Badge variant="outline" className={`text-xs ${verdictConf.bg}`}>
                                                        {verdictConf.label}
                                                    </Badge>
                                                )}
                                            </div>
                                            {item.profile_description && (
                                                <p className="text-sm text-muted-foreground">{item.profile_description}</p>
                                            )}
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                                                <span>Stawka: <strong className="text-foreground">{item.expected_rate} PLN/{item.rate_type === 'hourly' ? 'h' : 'mies.'}</strong></span>
                                                {item.market_rate_median && (
                                                    <>
                                                        <ArrowRight className="h-3 w-3" />
                                                        <span>Rynek: {item.market_rate_min}–{item.market_rate_max} (med: {item.market_rate_median})</span>
                                                    </>
                                                )}
                                                {item.compass_sample_size > 0 && (
                                                    <span>Compass: śr. {item.compass_rate_avg} ({item.compass_sample_size} kontr.)</span>
                                                )}
                                            </div>
                                            {item.notes && (
                                                <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                                                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-1">
                                                        <Sparkles className="h-3 w-3 text-amber-400" />
                                                        Podsumowanie AI
                                                    </p>
                                                    <p className="text-xs leading-relaxed whitespace-pre-line">{item.notes}</p>
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-xs text-muted-foreground shrink-0">
                                            {new Date(item.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                        {history.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">Brak historii weryfikacji</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function RateCard({ label, value, suffix, highlight }: { label: string; value: number | null; suffix: string; highlight?: boolean }) {
    return (
        <div className={`rounded-lg border p-3 text-center ${highlight ? 'border-primary/30 bg-primary/5' : 'border-white/10'}`}>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-lg font-bold tabular-nums ${highlight ? 'text-primary' : ''}`}>
                {value !== null ? formatNumber(value) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">{suffix}</p>
        </div>
    )
}

function RateComparisonBar({ min, max, median, userRate, compassAvg }: {
    min: number; max: number; median: number | null; userRate: number; compassAvg: number | null
}) {
    const padding = 0.15
    const rangeMin = Math.min(min, userRate, compassAvg || Infinity) * (1 - padding)
    const rangeMax = Math.max(max, userRate, compassAvg || 0) * (1 + padding)
    const range = rangeMax - rangeMin

    const toPercent = (v: number) => Math.max(0, Math.min(100, ((v - rangeMin) / range) * 100))

    const marketLeft = toPercent(min)
    const marketRight = toPercent(max)
    const marketWidth = marketRight - marketLeft

    return (
        <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Wizualizacja</h3>
            <div className="relative h-12 rounded-lg bg-muted/30 overflow-hidden">
                {/* Market range */}
                <div
                    className="absolute top-2 h-8 rounded bg-blue-500/20 border border-blue-500/30"
                    style={{ left: `${marketLeft}%`, width: `${marketWidth}%` }}
                />

                {/* Median marker */}
                {median !== null && (
                    <div
                        className="absolute top-1 h-10 w-0.5 bg-blue-400"
                        style={{ left: `${toPercent(median)}%` }}
                        title={`Mediana rynkowa: ${formatNumber(median)}`}
                    />
                )}

                {/* Compass average */}
                {compassAvg !== null && (
                    <div
                        className="absolute top-1 h-10 w-0.5 bg-purple-400"
                        style={{ left: `${toPercent(compassAvg)}%` }}
                        title={`Średnia Compass: ${formatNumber(compassAvg)}`}
                    />
                )}

                {/* User rate */}
                <div
                    className="absolute top-0 h-12 w-1 bg-white rounded-full shadow-lg shadow-white/20"
                    style={{ left: `${toPercent(userRate)}%` }}
                    title={`Twoja stawka: ${formatNumber(userRate)}`}
                />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatNumber(Math.round(rangeMin))}</span>
                <div className="flex gap-4">
                    <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-0.5 bg-blue-400" /> Mediana rynkowa
                    </span>
                    {compassAvg !== null && (
                        <span className="flex items-center gap-1">
                            <span className="inline-block w-3 h-0.5 bg-purple-400" /> Śr. Compass
                        </span>
                    )}
                    <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-white rounded-full" /> Twoja stawka
                    </span>
                </div>
                <span>{formatNumber(Math.round(rangeMax))}</span>
            </div>
        </div>
    )
}

function formatNumber(n: number): string {
    return n.toLocaleString('pl-PL')
}
