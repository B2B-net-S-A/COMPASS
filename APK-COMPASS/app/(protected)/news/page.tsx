'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Newspaper, Construction } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/context'

export default function NewsPage() {
    const { t } = useTranslation()

    return (
        <div className="container mx-auto max-w-4xl py-8 space-y-6">
            <header className="flex items-center gap-3">
                <Newspaper className="h-8 w-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold text-primary">{t('nav_news')}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t('news_tagline')}</p>
                </div>
            </header>

            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Construction className="h-5 w-5 text-muted-foreground" />
                        {t('coming_soon')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">{t('coming_soon_desc')}</p>
                    <p className="text-xs text-muted-foreground/60 mt-4">
                        Phase 4 roadmap — feed ogłoszeń od admina, broadcast email, reakcje, pinned posts.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
