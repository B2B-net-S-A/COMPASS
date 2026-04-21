'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Search, FileText, Upload, CheckCircle2 } from 'lucide-react'
import { updateProfileFull, searchCandidatesByName, claimCandidate, completeOnboarding } from '@/lib/actions/matching'
import { uploadCV, generateProfileFromCV } from '@/lib/actions/files'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { useRouter } from 'next/navigation'
import { useDebounce } from 'use-debounce'

type Step = 'choice' | 'search' | 'upload' | 'bio' | 'done'

interface CandidateResult {
    id: string
    full_name: string
    email: string | null
    skills: string[]
    bio_snippet: string | null
    cv_url: string | null
    created_at: string
    original_filename: string | null
}

export default function OnboardingPage() {
    const [step, setStep] = useState<Step>('choice')
    const [loading, setLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<CandidateResult[]>([])
    const [searching, setSearching] = useState(false)
    const [cvFile, setCvFile] = useState<File | null>(null)
    const [bio, setBio] = useState('')
    const [gdprConsent, setGdprConsent] = useState(false)
    const [claimed, setClaimed] = useState(false)
    const router = useRouter()

    const handleSearch = useCallback(async (query: string) => {
        if (query.trim().length < 2) {
            setSearchResults([])
            return
        }
        setSearching(true)
        try {
            const results = await searchCandidatesByName(query)
            setSearchResults(results)
        } catch {
            toast.error('Błąd wyszukiwania')
        } finally {
            setSearching(false)
        }
    }, [])

    const [debouncedSearch] = useDebounce(searchQuery, 400)
    useState(() => {
        if (debouncedSearch) handleSearch(debouncedSearch)
    })

    const handleClaim = async (candidateId: string) => {
        setLoading(true)
        try {
            const result = await claimCandidate(candidateId)
            if (result.success) {
                setClaimed(true)
                toastSuccess('CV przypisane do Twojego konta!')
                setStep('bio')
            } else {
                toast.error(result.error || 'Nie udało się przypisać CV')
            }
        } catch {
            toast.error('Wystąpił błąd')
        } finally {
            setLoading(false)
        }
    }

    const handleUpload = async () => {
        if (!cvFile) {
            toast.error('Wybierz plik CV')
            return
        }
        setLoading(true)
        try {
            const formData = new FormData()
            formData.append('file', cvFile)
            const uploadRes = await uploadCV(formData)
            if (uploadRes.success) {
                await generateProfileFromCV({ status: 'open' })
                toastSuccess('CV wgrane i przetworzone!')
                setStep('bio')
            } else {
                toast.error('Błąd uploadu: ' + (uploadRes.error || ''))
            }
        } catch (e: unknown) {
            toast.error('Błąd: ' + (e instanceof Error ? e.message : 'Nieznany'))
        } finally {
            setLoading(false)
        }
    }

    const handleFinish = async () => {
        if (!gdprConsent) {
            toast.error('Wymagana zgoda RODO')
            return
        }
        setLoading(true)
        try {
            const result = await updateProfileFull({
                bio: bio || undefined,
                gdpr_consent: true,
            })
            if (result.success === false) {
                toast.error(result.error || 'Błąd zapisu')
                return
            }

            await completeOnboarding()
            toastSuccess('Profil utworzony pomyślnie!')
            setStep('done')
            router.push('/home')
            router.refresh()
        } catch (e: unknown) {
            toast.error('Błąd: ' + (e instanceof Error ? e.message : 'Nieznany'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-2xl bg-card border-white/10 shadow-2xl">
                <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                        {['choice', 'search', 'upload'].includes(step) && (
                            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">Krok 1/2</span>
                        )}
                        {step === 'bio' && (
                            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">Krok 2/2</span>
                        )}
                    </div>
                    <CardTitle className="text-2xl">
                        {step === 'choice' && 'Witaj w ComPass!'}
                        {step === 'search' && 'Znajdz swoje CV'}
                        {step === 'upload' && 'Wgraj swoje CV'}
                        {step === 'bio' && 'Uzupelnij profil'}
                        {step === 'done' && 'Gotowe!'}
                    </CardTitle>
                    <CardDescription>
                        {step === 'choice' && 'Czy Twoje CV jest juz w bazie ComPass?'}
                        {step === 'search' && 'Wpisz swoje imie i nazwisko aby znalezc CV'}
                        {step === 'upload' && 'Wgraj plik CV w formacie PDF lub DOCX'}
                        {step === 'bio' && 'Dodaj krotki opis i zaakceptuj RODO'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {step === 'choice' && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <button
                                onClick={() => setStep('search')}
                                className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 hover:border-primary/50 hover:bg-primary/5 transition-all"
                            >
                                <Search className="h-10 w-10 text-primary" />
                                <div className="text-center">
                                    <p className="font-semibold">Tak, jest w bazie</p>
                                    <p className="text-xs text-muted-foreground mt-1">Znajde i przypisze do konta</p>
                                </div>
                            </button>
                            <button
                                onClick={() => setStep('upload')}
                                className="flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 hover:border-primary/50 hover:bg-primary/5 transition-all"
                            >
                                <Upload className="h-10 w-10 text-primary" />
                                <div className="text-center">
                                    <p className="font-semibold">Nie, wgram nowe</p>
                                    <p className="text-xs text-muted-foreground mt-1">Uploaduje plik CV</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {step === 'search' && (
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Jan Kowalski..."
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value)
                                        handleSearch(e.target.value)
                                    }}
                                    className="pl-10 bg-white/5"
                                    autoFocus
                                />
                            </div>

                            {searching && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Szukam...
                                </div>
                            )}

                            {searchResults.length > 0 && (
                                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                    {searchResults.map((c) => (
                                        <div key={c.id} className="p-4 rounded-lg border border-white/10 hover:border-primary/30 transition-colors">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <p className="font-semibold">{c.full_name}</p>
                                                    {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                                                    {c.skills.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {c.skills.map((s, i) => (
                                                                <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{s}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {c.bio_snippet && (
                                                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{c.bio_snippet}</p>
                                                    )}
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        <FileText className="inline h-3 w-3 mr-1" />
                                                        {c.original_filename || 'CV'} | {new Date(c.created_at).toLocaleDateString('pl')}
                                                    </p>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleClaim(c.id)}
                                                    disabled={loading}
                                                >
                                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'To moje CV'}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                                <div className="text-center py-6 text-muted-foreground">
                                    <p>Nie znaleziono CV o tym imieniu.</p>
                                    <Button variant="link" onClick={() => setStep('upload')} className="mt-2">
                                        Wgraj nowe CV zamiast tego
                                    </Button>
                                </div>
                            )}

                            <div className="flex gap-2 pt-4 border-t border-white/10">
                                <Button variant="outline" onClick={() => setStep('choice')}>Wstecz</Button>
                                <Button variant="ghost" onClick={() => setStep('upload')} className="ml-auto">
                                    Nie znalazlem -- wgraj nowe
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'upload' && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label>Plik CV (PDF lub DOCX)</Label>
                                <div className="border-2 border-dashed border-white/10 rounded-lg p-8 text-center hover:bg-white/5 cursor-pointer transition-colors">
                                    <Input
                                        type="file"
                                        accept=".pdf,.docx"
                                        onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                                        className="hidden"
                                        id="cv-upload"
                                    />
                                    <label htmlFor="cv-upload" className="cursor-pointer block">
                                        {cvFile ? (
                                            <div className="flex items-center justify-center gap-2 text-green-400">
                                                <CheckCircle2 className="h-5 w-5" />
                                                <span>{cvFile.name}</span>
                                            </div>
                                        ) : (
                                            <div>
                                                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                                <span className="text-muted-foreground">Kliknij aby wybrac plik</span>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setStep('choice')}>Wstecz</Button>
                                <Button onClick={handleUpload} disabled={!cvFile || loading} className="flex-1">
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Wgraj i analizuj CV
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'bio' && (
                        <div className="space-y-6">
                            {claimed && (
                                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                                    CV zostało przypisane do Twojego konta.
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>Krótkie Bio / O mnie</Label>
                                <Textarea
                                    placeholder="Napisz kilka słów o swoim doświadczeniu..."
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    className="bg-white/5 min-h-[100px]"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {claimed ? 'Opcjonalne -- bio z CV zostało już załadowane.' : 'Min. 10 znaków.'}
                                </p>
                            </div>

                            <div className="flex items-start gap-2 p-4 bg-white/5 rounded-lg">
                                <Checkbox
                                    id="gdpr"
                                    checked={gdprConsent}
                                    onCheckedChange={(c) => setGdprConsent(c === true)}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label htmlFor="gdpr" className="text-sm font-medium leading-none">
                                        Zgoda RODO (Wymagana)
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Wyrazam zgode na przetwarzanie danych w celu rekrutacji.
                                    </p>
                                </div>
                            </div>

                            <Button onClick={handleFinish} disabled={loading || !gdprConsent} className="w-full">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Zakoncz i przejdz do ComPass
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
