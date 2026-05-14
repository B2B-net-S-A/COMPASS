'use client'

import { useTranslation } from '@/lib/i18n/context'

export function WelcomeMessage({ userName }: { userName: string }) {
    const { t } = useTranslation()

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-primary">{t('welcome')}, {userName}!</h1>
            <p className="text-muted-foreground">
                {t('panel')}
            </p>
        </div>
    )
}
