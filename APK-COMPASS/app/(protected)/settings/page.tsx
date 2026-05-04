'use client'

import { AIAppearanceSettings } from '@/components/settings/AIAppearanceSettings'

export default function UserSettingsPage() {
    return (
        <div className="space-y-6 max-w-2xl p-6">
            <div>
                <h1 className="text-3xl font-bold text-primary">Ustawienia</h1>
                <p className="text-muted-foreground mt-1">Personalizuj wygląd i zachowanie aplikacji.</p>
            </div>
            <AIAppearanceSettings />
        </div>
    )
}
