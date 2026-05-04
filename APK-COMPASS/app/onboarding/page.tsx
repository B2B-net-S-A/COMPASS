'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Loader2, Upload, CheckCircle2 } from 'lucide-react'
import { updateProfileFull, completeOnboarding } from '@/lib/actions/profile'
import { uploadCV, generateProfileFromCV } from '@/lib/actions/files'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { useRouter } from 'next/navigation'

// Phase 1.0 (2026-05-04): simplified onboarding — removed candidate-claim flow
// (legacy ATS feature, candidates table archived). Now: optional CV upload → bio + GDPR.

type Step = 'upload' | 'bio' | 'done'

export default function OnboardingPage() {
    const [step, setStep] = useState<Step>('upload')
    const [loading, setLoading] = useState(false)
    const [cvFile, setCvFile] = useState<File | null>(null)
    const [bio, setBio] = useState('')
    const [gdprConsent, setGdprConsent] = useState(false)
    const [cvUploaded, setCvUploaded] = useState(false)
    const router = useRouter()

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
                setCvUploaded(true)
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

    const handleSkipUpload = () => {
        setStep('bio')
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
                        {step === 'upload' && (
                            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">Krok 1/2</span>
                        )}
                        {step === 'bio' && (
                            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">Krok 2/2</span>
                        )}
                    </div>
                    <CardTitle className="text-2xl">
                        {step === 'upload' && 'Witaj w ComPass!'}
                        {step === 'bio' && 'Uzupełnij profil'}
                        {step === 'done' && 'Gotowe!'}
                    </CardTitle>
                    <CardDescription>
                        {step === 'upload' && 'Wgraj swoje CV w formacie PDF lub DOCX (opcjonalnie)'}
                        {step === 'bio' && 'Dodaj krótki opis i zaakceptuj RODO'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
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
                                                <span className="text-muted-foreground">Kliknij aby wybrać plik</span>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button variant="ghost" onClick={handleSkipUpload}>
                                    Pomiń (dodam później)
                                </Button>
                                <Button onClick={handleUpload} disabled={!cvFile || loading} className="flex-1">
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Wgraj i analizuj CV
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'bio' && (
                        <div className="space-y-6">
                            {cvUploaded && (
                                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                                    CV wgrane — możesz dopisać bio lub zostawić puste.
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
                                    {cvUploaded ? 'Opcjonalne — bio z CV zostało już załadowane.' : 'Min. 10 znaków.'}
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
                                        Wyrażam zgodę na przetwarzanie danych w celu współpracy z Dynaminds.
                                    </p>
                                </div>
                            </div>

                            <Button onClick={handleFinish} disabled={loading || !gdprConsent} className="w-full">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Zakończ i przejdź do ComPass
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
