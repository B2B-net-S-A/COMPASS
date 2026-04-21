'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    ShieldCheck,
    ExternalLink,
    FileCheck,
    AlertCircle,
    Download,
    Scale,
    Lock,
    EyeOff
} from "lucide-react"

export function ComplianceSection() {
    return (
        <div className="space-y-6">
            <Card className="bg-primary/10 border-primary/20 overflow-hidden">
                <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-white/5">
                    <div className="p-3 bg-primary/20 rounded-xl text-primary">
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <div>
                        <CardTitle className="text-xl font-bold">KONTRAKTORZY BNP PARIBAS</CardTitle>
                        <p className="text-sm text-primary/70">Wymogi bezpieczeństwa i etyki</p>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                    <div className="bg-black/20 p-4 rounded-lg border border-white/5 space-y-3">
                        <p className="text-sm font-semibold text-white uppercase tracking-tight">Kodeks Postępowania BNP Paribas</p>
                        <p className="text-xs text-gray-300 leading-relaxed">
                            Jako kontrahent pracujący dla klienta BNP Paribas, masz obowiązek zapoznać się z aktualnym
                            Kodeksem Postępowania oraz przestrzegać zasad bezpieczeństwa informacji.
                        </p>
                        <div className="flex flex-wrap gap-3 pt-2">
                            <Button size="sm" variant="outline" className="h-8 text-[10px] gap-2 border-primary/30 hover:bg-primary/10">
                                <ExternalLink className="w-3 h-3" /> Strona BNP Paribas
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-[10px] gap-2 border-primary/30 hover:bg-primary/10">
                                <Download className="w-3 h-3" /> Pobierz Kodeks
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-xl">
                        <div className="flex gap-3 items-center">
                            <FileCheck className="w-5 h-5 text-primary" />
                            <p className="text-xs font-bold text-white uppercase">Status Potwierdzenia</p>
                        </div>
                        <Button className="bg-burgundy hover:bg-burgundy h-9 px-6 text-xs uppercase font-bold tracking-widest">
                            Potwierdzam zapoznanie się
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export function WhistleblowerSection() {
    return (
        <div className="space-y-6">
            <Card className="bg-red-500/10 border-red-500/20 overflow-hidden">
                <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-white/5">
                    <div className="p-3 bg-red-500/20 rounded-xl text-red-500">
                        <Scale className="w-8 h-8" />
                    </div>
                    <div>
                        <CardTitle className="text-xl font-bold uppercase tracking-tight">Procedura Sygnalistów</CardTitle>
                        <p className="text-sm text-red-400/70">Dyrektywa UE & Ustawa z 14 czerwca 2024</p>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                    <p className="text-sm text-gray-300 leading-relaxed">
                        B2B.net zapewnia każdemu współpracownikowi możliwość bezpiecznego i anonimowego zgłaszania
                        naruszeń prawa. Nasza procedura gwarantuje pełną ochronę przed działaniami odwetowymi.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Card className="bg-black/20 border-white/5 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-red-400">
                                <EyeOff className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase">Pełna Anonimowość</span>
                            </div>
                            <p className="text-[10px] text-gray-400">Twoja tożsamość jest chroniona przez dedykowany system szyfrowany.</p>
                        </Card>
                        <Card className="bg-black/20 border-white/5 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-red-400">
                                <Lock className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase">Ochrona Prawna</span>
                            </div>
                            <p className="text-[10px] text-gray-400">Zgodność z nowymi przepisami o ochronie sygnalistów.</p>
                        </Card>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <Button className="flex-1 bg-red-600 hover:bg-red-700 h-12 uppercase font-bold tracking-tighter gap-2">
                            <AlertCircle className="w-4 h-4" /> Zgłoś Naruszenie (Anonimowo)
                        </Button>
                        <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5 h-12 gap-2">
                            <Download className="w-4 h-4" /> Pobierz Procedurę
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
