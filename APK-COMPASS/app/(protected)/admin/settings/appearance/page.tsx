'use client'

import { AIAppearanceSettings } from '@/components/settings/AIAppearanceSettings'
import { ThemeSwitcher } from '@/components/theme/ThemeSwitcher'
import { ColorModeToggle } from '@/components/theme/ColorModeToggle'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Palette, SunMoon } from 'lucide-react'

export default function AppearanceSettingsPage() {
    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-lg font-medium">Personalizacja i wygląd</h3>
                <p className="text-sm text-muted-foreground">
                    Dostosuj motyw kolorystyczny aplikacji oraz wygląd widgetu Asystenta AI.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/30 flex items-center justify-center">
                            <Palette className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Motyw kolorystyczny</CardTitle>
                            <CardDescription>
                                Wybierz schemat kolorów dla całej aplikacji. Zmiana jest natychmiastowa.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <ThemeSwitcher />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/30 flex items-center justify-center">
                            <SunMoon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Tryb jasny / ciemny</CardTitle>
                            <CardDescription>
                                Przełącz między ciemnym a jasnym trybem wyświetlania. Idealne dla klientów korporacyjnych.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <ColorModeToggle />
                </CardContent>
            </Card>

            <AIAppearanceSettings />
        </div>
    )
}
