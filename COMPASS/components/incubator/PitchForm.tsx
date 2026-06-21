'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, Shield, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { submitPitch } from '@/lib/actions/incubator'
import { NdaAcceptModal } from './NdaAcceptModal'

export function PitchForm() {
    const router = useRouter()
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [equity, setEquity] = useState('')
    const [investment, setInvestment] = useState('')
    const [attachments, setAttachments] = useState('')
    const [ndaTimestamp, setNdaTimestamp] = useState<string | null>(null)
    const [showNdaModal, setShowNdaModal] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const canSubmit = ndaTimestamp && title.trim().length >= 3 && description.trim().length >= 30 && !isPending

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!ndaTimestamp) {
            setShowNdaModal(true)
            return
        }
        setError(null)
        startTransition(async () => {
            const investmentNum = investment ? parseInt(investment, 10) : undefined
            const attachmentList = attachments
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)

            const res = await submitPitch({
                title,
                description_md: description,
                attachment_urls: attachmentList,
                equity_ask: equity || undefined,
                investment_ask_pln: investmentNum,
                nda_accepted_at: ndaTimestamp,
            })
            if (!res.success) { setError(res.error); return }
            router.push('/incubator/my-pitches')
        })
    }

    return (
        <>
            <NdaAcceptModal
                open={showNdaModal}
                onAccept={(ts) => {
                    setNdaTimestamp(ts)
                    setShowNdaModal(false)
                }}
                onClose={() => setShowNdaModal(false)}
            />

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>}

                {!ndaTimestamp ? (
                    <Card className="bg-warning/5 border-warning/30">
                        <CardContent className="p-5 flex items-start gap-3">
                            <Shield className="w-6 h-6 text-warning shrink-0 mt-0.5" />
                            <div className="flex-1 space-y-2">
                                <h3 className="font-semibold">Wymagana akceptacja oświadczenia poufności</h3>
                                <p className="text-sm text-muted-foreground">
                                    Zanim opiszesz pomysł, zaakceptuj oświadczenie ochrony własności intelektualnej.
                                </p>
                                <Button type="button" onClick={() => setShowNdaModal(true)} variant="outline" className="gap-2">
                                    <Shield className="w-4 h-4" /> Zobacz i zaakceptuj
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="bg-success/5 border-success/30">
                        <CardContent className="p-3 flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-success" />
                            <span>Oświadczenie zaakceptowane: {new Date(ndaTimestamp).toLocaleString('pl-PL')}</span>
                            <Badge variant="outline" className="ml-auto text-[10px] border-success/30 text-success">OK</Badge>
                        </CardContent>
                    </Card>
                )}

                <Card className="bg-card border-border">
                    <CardContent className="p-5 space-y-4">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Tytuł pomysłu *</label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="np. AI-powered code review for security audits"
                                disabled={isPending || !ndaTimestamp}
                                required minLength={3}
                            />
                        </div>

                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Opis *</label>
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={10}
                                placeholder="Co rozwiązuje? Dla kogo? Status (idea / MVP / działający produkt)? Konkurencja? Twoje zasoby?"
                                disabled={isPending || !ndaTimestamp}
                                required minLength={30}
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">Markdown obsługiwany. Min 30 znaków.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Oczekiwana inwestycja (PLN)</label>
                                <Input
                                    type="number"
                                    value={investment}
                                    onChange={(e) => setInvestment(e.target.value)}
                                    placeholder="np. 200000"
                                    min="0" max="500000"
                                    disabled={isPending || !ndaTimestamp}
                                />
                                <p className="text-[10px] text-muted-foreground mt-1">Do 500 000 PLN.</p>
                            </div>

                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Forma rozliczenia</label>
                                <Input
                                    value={equity}
                                    onChange={(e) => setEquity(e.target.value)}
                                    placeholder="np. 5% equity, 20% royalty, uzgodnimy"
                                    disabled={isPending || !ndaTimestamp}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Załączniki — linki (jeden na linijkę)</label>
                            <Textarea
                                value={attachments}
                                onChange={(e) => setAttachments(e.target.value)}
                                rows={3}
                                placeholder="https://drive.google.com/...&#10;https://docs.google.com/..."
                                disabled={isPending || !ndaTimestamp}
                                className="font-mono text-xs"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">Pitch deck, MVP demo, prototyp. Link zewnętrzny.</p>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button type="submit" disabled={!canSubmit} className="gap-2">
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Złóż pitch
                    </Button>
                </div>
            </form>
        </>
    )
}
