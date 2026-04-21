'use client'

import { useState } from 'react'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { UploadCloud, Link as LinkIcon, Type, Loader2, Sparkles } from 'lucide-react'
import { importCandidate, importProject, importFromText, importFromLink } from '@/lib/actions/bulk-import'
import { ProtectedPage } from '@/components/common/ProtectedPage'

type ImportMode = 'file' | 'text' | 'link'

export default function AdminImportPage() {
    const [loading, setLoading] = useState(false)
    const [logs, setLogs] = useState<string[]>([])
    const [textInput, setTextInput] = useState('')
    const [linkInput, setLinkInput] = useState('')

    const addLog = (message: string) => setLogs(prev => [message, ...prev])

    const handleImport = async (type: 'candidate' | 'project', mode: ImportMode, event?: React.ChangeEvent<HTMLInputElement>) => {
        setLoading(true)
        addLog(`🚀 Rozpoczynam import (${type}, ${mode})...`)

        try {
            let res: any
            if (mode === 'file' && event?.target.files) {
                const files = event.target.files
                for (let i = 0; i < files.length; i++) {
                    const file = files[i]
                    addLog(`⏳ Przetwarzanie pliku: ${file.name}...`)
                    const formData = new FormData()
                    formData.append('file', file)
                    res = type === 'candidate' ? await importCandidate(formData) : await importProject(formData)
                    handleResult(res)
                }
            } else if (mode === 'text') {
                if (!textInput.trim()) throw new Error('Wklej tekst profilu lub projektu.')
                addLog('⏳ Analiza AI tekstu...')
                res = await importFromText(textInput, type)
                handleResult(res)
                setTextInput('')
            } else if (mode === 'link') {
                if (!linkInput.trim()) throw new Error('Podaj poprawny URL.')
                addLog(`⏳ Pobieranie i analiza: ${linkInput}...`)
                res = await importFromLink(linkInput, type)
                handleResult(res)
                setLinkInput('')
            }
        } catch (error: any) {
            addLog(`❌ Błąd: ${error.message}`)
        } finally {
            setLoading(false)
            if (event) event.target.value = ''
        }
    }

    const handleResult = (res: any) => {
        if (res.success) {
            addLog(`✅ Sukces: ${res.name || res.title || 'Przetworzono pomyślnie'}`)
        } else {
            addLog(`⚠️ Ostrzeżenie: ${res.message || 'Nieznany błąd'}`)
        }
    }

    const ModeCard = ({ type, mode }: { type: 'candidate' | 'project', mode: ImportMode }) => {
        const isCandidate = type === 'candidate'
        const baseColor = isCandidate ? 'cyan' : 'green'

        return (
            <Card className={`bg-background/50 border-white/10 hover:border-${baseColor}-500/50 transition-all`}>
                <CardContent className="p-6">
                    {mode === 'file' && (
                        <div className="flex flex-col items-center space-y-4">
                            <UploadCloud className={`h-12 w-12 text-${baseColor}-400`} />
                            <p className="text-sm text-gray-400 text-center">Wgraj PDF/Word. AI wyciągnie dane.</p>
                            <div className="relative">
                                <Input
                                    type="file"
                                    multiple
                                    accept=".pdf,.docx"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onChange={(e) => handleImport(type, 'file', e)}
                                    disabled={loading}
                                />
                                <Button disabled={loading} className={`bg-${baseColor}-600 hover:bg-${baseColor}-700`}>
                                    Wybierz Pliki
                                </Button>
                            </div>
                        </div>
                    )}
                    {mode === 'text' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Type className={`h-5 w-5 text-${baseColor}-400`} />
                                <span className="text-sm font-medium">Wklej treść (Raw Text)</span>
                            </div>
                            <Textarea
                                placeholder={isCandidate ? "Wklej tutaj CV lub bio kandydata..." : "Wklej tutaj opis lub specyfikację projektu..."}
                                className="min-h-[200px] bg-black/30 border-white/5"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                            />
                            <Button
                                onClick={() => handleImport(type, 'text')}
                                disabled={loading}
                                className={`w-full bg-${baseColor}-600 hover:bg-${baseColor}-700`}
                            >
                                {loading ? <Loader2 className="animate-spin mr-2" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                Przetwórz przez AI
                            </Button>
                        </div>
                    )}
                    {mode === 'link' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <LinkIcon className={`h-5 w-5 text-${baseColor}-400`} />
                                <span className="text-sm font-medium">Link (LinkedIn / GitHub / URL)</span>
                            </div>
                            <Input
                                placeholder="https://..."
                                className="bg-black/30 border-white/5"
                                value={linkInput}
                                onChange={(e) => setLinkInput(e.target.value)}
                            />
                            <Button
                                onClick={() => handleImport(type, 'link')}
                                disabled={loading}
                                className={`w-full bg-${baseColor}-600 hover:bg-${baseColor}-700`}
                            >
                                {loading ? <Loader2 className="animate-spin mr-2" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                                Pobierz i Importuj
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        )
    }

    return (
        <ProtectedPage feature="import">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Sparkles className="text-yellow-400" />
                        AI Strategic Import
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        3 kanały wejścia: Pliki, Tekst, Linki. AI zajmie się standaryzacją i skill-mapą.
                    </p>
                </div>
            </div>

            <Tabs defaultValue="candidates" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-background/80 p-1 rounded-xl mb-6">
                    <TabsTrigger value="candidates" className="rounded-lg data-[state=active]:bg-cyan-600/20 data-[state=active]:text-foreground py-3">
                        👨‍💻 Kandydaci
                    </TabsTrigger>
                    <TabsTrigger value="projects" className="rounded-lg data-[state=active]:bg-green-600/20 data-[state=active]:text-green-400 py-3">
                        🚀 Projekty
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="candidates" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <ModeCard type="candidate" mode="file" />
                        <ModeCard type="candidate" mode="text" />
                        <ModeCard type="candidate" mode="link" />
                    </div>
                </TabsContent>

                <TabsContent value="projects" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <ModeCard type="project" mode="file" />
                        <ModeCard type="project" mode="text" />
                        <ModeCard type="project" mode="link" />
                    </div>
                </TabsContent>
            </Tabs>

            <Card className="bg-black/40 border-white/5 overflow-hidden">
                <CardHeader className="bg-background/50 border-b border-white/5 py-3 px-4">
                    <CardTitle className="text-xs font-mono text-muted-foreground flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        AI PROCESSOR LOGS
                    </CardTitle>
                </CardHeader>
                <CardContent className="h-64 overflow-y-auto font-mono text-xs space-y-1 p-4 bg-black/20">
                    {logs.length === 0 && <span className="text-muted-foreground">Oczekiwanie na zadania...</span>}
                    {logs.map((log, i) => (
                        <div key={i} className={`
                            ${log.includes('❌') ? 'text-red-400' :
                                log.includes('✅') ? 'text-green-400' :
                                    log.includes('🚀') ? 'text-yellow-400 font-bold' :
                                        log.includes('⏳') ? 'text-foreground' : 'text-foreground'}
                        `}>
                            {log}
                        </div>
                    ))}
                </CardContent>
            </Card>
        </ProtectedPage>
    )
}
