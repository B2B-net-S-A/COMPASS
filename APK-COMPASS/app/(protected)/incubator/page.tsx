'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Lightbulb, Construction } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/context'

export default function IncubatorPage() {
    const { t } = useTranslation()

    return (
        <div className="container mx-auto max-w-4xl py-8 space-y-6">
            <header className="flex items-center gap-3">
                <Lightbulb className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold text-primary">{t('nav_incubator')}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t('incubator_tagline')}</p>
                </div>
            </header>

            <div className="grid md:grid-cols-2 gap-4">
                <Card className="border-dashed">
                    <CardHeader>
                        <CardTitle className="text-lg">Mam pomysł</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                            Zgłoś własne rozwiązanie — możliwa inwestycja do 500 000 PLN i partnerska umowa dystrybucji.
                        </p>
                        <p className="text-xs text-muted-foreground/60">{t('coming_soon')}</p>
                    </CardContent>
                </Card>

                <Card className="border-dashed">
                    <CardHeader>
                        <CardTitle className="text-lg">Pracuj nad naszym produktem</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                            Wewnętrzne projekty Dynaminds otwarte na zaangażowanie konsultantów.
                        </p>
                        <p className="text-xs text-muted-foreground/60">{t('coming_soon')}</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Construction className="h-4 w-4 text-muted-foreground" />
                        Phase 5 roadmap
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">
                        Pełen flow z formularzem pitcha, NDA-gating, kolejką review, listą wewnętrznych projektów i aplikacjami konsultantów.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
