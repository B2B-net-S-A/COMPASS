'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Phone, Mail, MessageSquare, HelpCircle, ExternalLink, ShieldCheck, Users, Loader2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Link from "next/link"
import { getMyRecruiter } from '@/lib/actions/centrala-management'

interface RecruiterInfo {
    full_name: string
    email: string
    phone: string | null
    avatar_url: string | null
}

interface RecruiterSectionProps {
    recruiterInfo?: RecruiterInfo | null
}

export function RecruiterSection({ recruiterInfo: propRecruiterInfo }: RecruiterSectionProps) {
    const [recruiterInfo, setRecruiterInfo] = useState<RecruiterInfo | null | undefined>(propRecruiterInfo)
    const [loading, setLoading] = useState(!propRecruiterInfo)

    useEffect(() => {
        // If no props passed, fetch from server action
        if (propRecruiterInfo === undefined) {
            getMyRecruiter().then(data => {
                setRecruiterInfo(data)
                setLoading(false)
            }).catch(() => setLoading(false))
        }
    }, [propRecruiterInfo])

    const initials = recruiterInfo?.full_name
        ? recruiterInfo.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'R'

    return (
        <div className="space-y-6">
            {/* Ambassador / Recruiter info */}
            <Card className="bg-white/5 border-white/10 overflow-hidden">
                <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-white/5">
                    {recruiterInfo ? (
                        <Avatar className="w-16 h-16 border-2 border-primary/30">
                            <AvatarImage src={recruiterInfo.avatar_url || ''} />
                            <AvatarFallback className="text-xl bg-background text-foreground">{initials}</AvatarFallback>
                        </Avatar>
                    ) : (
                        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-burgundy/30 to-primary/30 flex items-center justify-center border-2 border-primary/30">
                            <Users className="w-8 h-8 text-primary" />
                        </div>
                    )}
                    <div>
                        <CardTitle className="text-xl font-bold">
                            {recruiterInfo ? recruiterInfo.full_name : 'Twój Ambasador — Rekruter'}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                            {recruiterInfo ? 'Twój Opiekun w B2B.net' : 'Główny punkt kontaktowy w B2B.net'}
                        </p>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                    {recruiterInfo ? (
                        <>
                            <p className="text-sm text-gray-300 leading-relaxed">
                                Twój Rekruter jest głównym źródłem informacji i wsparcia we wszystkich kwestiach
                                związanych z Twoim kontraktem — procedury, warunki umowy, dodatkowa pomoc.
                            </p>

                            {/* Contact methods */}
                            <div className="grid gap-3 sm:grid-cols-2">
                                {recruiterInfo.email && (
                                    <a
                                        href={`mailto:${recruiterInfo.email}`}
                                        className="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/5 hover:bg-white/5 transition-colors"
                                    >
                                        <Mail className="w-5 h-5 text-primary shrink-0" />
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">E-mail</p>
                                            <p className="text-sm font-bold text-primary">{recruiterInfo.email}</p>
                                        </div>
                                    </a>
                                )}
                                {recruiterInfo.phone && (
                                    <a
                                        href={`tel:+48${recruiterInfo.phone.replace(/\s/g, '')}`}
                                        className="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/5 hover:bg-white/5 transition-colors"
                                    >
                                        <Phone className="w-5 h-5 text-slate-200 shrink-0" />
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Telefon</p>
                                            <p className="text-sm font-bold text-slate-200 font-mono">{recruiterInfo.phone}</p>
                                        </div>
                                    </a>
                                )}
                            </div>

                            <a
                                href={`https://teams.microsoft.com/l/chat/0/0?users=${recruiterInfo.email}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 bg-burgundy/10 rounded-lg border border-burgundy/20 hover:bg-burgundy/20 transition-colors w-full"
                            >
                                <MessageSquare className="w-5 h-5 text-foreground shrink-0" />
                                <div>
                                    <p className="text-sm font-bold text-foreground">Napisz na Teams</p>
                                    <p className="text-[10px] text-muted-foreground">Szybki kontakt przez Microsoft Teams</p>
                                </div>
                            </a>
                        </>
                    ) : (
                        <p className="text-sm text-gray-300 leading-relaxed">
                            Twój Rekruter jest głównym źródłem informacji i wsparcia we wszystkich kwestiach
                            związanych z Twoim kontraktem — procedury, warunki umowy, dodatkowa pomoc.
                            Kontaktuj się przez e-mail, telefon, Teams lub spotkanie osobiste.
                        </p>
                    )}

                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <p className="text-xs text-amber-300 flex items-center gap-2">
                            <HelpCircle className="w-4 h-4 shrink-0" />
                            Problem z kontaktem? Napisz na: <a href="mailto:administracja@b2bnetwork.pl" className="font-bold text-amber-200 hover:underline">administracja@b2bnetwork.pl</a>
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Contact directory from onboarding */}
            <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Mail className="w-4 h-4 text-primary" />
                        Kontakty działowe
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5 hover:bg-white/5 transition-colors">
                            <div>
                                <p className="text-sm font-bold text-gray-200">Pakiety medyczne i sportowe</p>
                                <p className="text-[10px] text-muted-foreground">Benefity, deklaracje, karty sportowe</p>
                            </div>
                            <a href="mailto:benefity@b2bnetwork.pl" className="text-xs font-bold text-primary hover:underline">
                                benefity@b2bnetwork.pl
                            </a>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5 hover:bg-white/5 transition-colors">
                            <div>
                                <p className="text-sm font-bold text-gray-200">Rozliczenia finansowe</p>
                                <p className="text-[10px] text-muted-foreground">Faktury, płatności, umowy</p>
                            </div>
                            <a href="mailto:rozliczenia@b2bnetwork.pl" className="text-xs font-bold text-primary hover:underline">
                                rozliczenia@b2bnetwork.pl
                            </a>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5 hover:bg-white/5 transition-colors">
                            <div>
                                <p className="text-sm font-bold text-gray-200">Sprzęt, zakupy biurowe</p>
                                <p className="text-[10px] text-muted-foreground">Hardware, biuro, zaopatrzenie</p>
                            </div>
                            <a href="mailto:recepcja@b2bnetwork.pl" className="text-xs font-bold text-primary hover:underline">
                                recepcja@b2bnetwork.pl
                            </a>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5 hover:bg-white/5 transition-colors">
                            <div>
                                <p className="text-sm font-bold text-gray-200">Rekomendacje kandydatów</p>
                                <p className="text-[10px] text-muted-foreground">Polecaj specjalistów IT</p>
                            </div>
                            <a href="mailto:rekrutacja@b2bnetwork.pl" className="text-xs font-bold text-primary hover:underline">
                                rekrutacja@b2bnetwork.pl
                            </a>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Finance contacts */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Phone className="w-4 h-4 text-slate-200" />
                            Dział Rozliczeń — kontakt bezpośredni
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-gray-200">Anna Korycka</p>
                                <a href="mailto:anna.korycka@b2bnetwork.pl" className="text-[10px] text-primary hover:underline">anna.korycka@b2bnetwork.pl</a>
                            </div>
                            <a href="tel:+48577317270" className="text-xs text-slate-200 hover:underline font-mono">577 317 270</a>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-gray-200">Michał Stankiewicz</p>
                                <a href="mailto:michal.stankiewicz@b2bnetwork.pl" className="text-[10px] text-primary hover:underline">michal.stankiewicz@b2bnetwork.pl</a>
                            </div>
                            <a href="tel:+48533317619" className="text-xs text-slate-200 hover:underline font-mono">533 317 619</a>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-primary" />
                            Procedury
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Link href="#" className="flex items-center justify-between text-xs text-slate-200 hover:underline">
                                <span>Aneksowanie umów</span>
                                <ExternalLink className="w-3 h-3" />
                            </Link>
                            <Link href="#" className="flex items-center justify-between text-xs text-slate-200 hover:underline">
                                <span>Zasady wypowiedzenia</span>
                                <ExternalLink className="w-3 h-3" />
                            </Link>
                            <Link href="https://www.bnpparibas.pl/csr/strategia-csr/lad-korporacyjny" target="_blank" className="flex items-center justify-between text-xs text-slate-200 hover:underline">
                                <span>Kodeks Postępowania BNP Paribas</span>
                                <ExternalLink className="w-3 h-3" />
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
