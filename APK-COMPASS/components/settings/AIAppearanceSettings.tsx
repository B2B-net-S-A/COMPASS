'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Bot, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    useAIAssistantPreferences,
    GLOW_COLOR_CONFIG,
    type GlowColor,
} from '@/lib/contexts/AIAssistantPreferencesContext'

const GLOW_COLORS: GlowColor[] = ['violet', 'blue', 'green', 'red', 'orange', 'pink', 'cyan', 'none']

export function AIAppearanceSettings() {
    const { preferences, setGlowColor, setGlowEnabled } = useAIAssistantPreferences()

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-burgundy/20 to-primary/20 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">Asystent AI — wygląd</CardTitle>
                        <CardDescription>
                            Zmień kolor poświaty lub wyłącz ją całkowicie.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Glow Toggle */}
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label htmlFor="glow-toggle" className="text-sm font-medium">
                            Poświata wokół ekranu
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            Migająca poświata dookoła krawędzi ekranu aplikacji
                        </p>
                    </div>
                    <Switch
                        id="glow-toggle"
                        checked={preferences.glowEnabled}
                        onCheckedChange={setGlowEnabled}
                    />
                </div>

                {/* Color Picker */}
                <div className={cn(
                    "space-y-3 transition-opacity",
                    !preferences.glowEnabled && "opacity-40 pointer-events-none"
                )}>
                    <Label className="text-sm font-medium">Kolor poświaty</Label>
                    <div className="grid grid-cols-4 gap-3">
                        {GLOW_COLORS.map((color) => {
                            const config = GLOW_COLOR_CONFIG[color]
                            const isSelected = preferences.glowColor === color
                            const isNone = color === 'none'

                            return (
                                <button
                                    key={color}
                                    onClick={() => setGlowColor(color)}
                                    className={cn(
                                        "relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                                        isSelected
                                            ? "border-primary bg-primary/5 scale-105"
                                            : "border-muted hover:border-muted-foreground/30 hover:bg-muted/50"
                                    )}
                                >
                                    <div className="relative">
                                        <div
                                            className={cn(
                                                "h-10 w-10 rounded-full transition-all",
                                                !isNone && "shadow-lg"
                                            )}
                                            style={{
                                                background: isNone
                                                    ? 'linear-gradient(135deg, #3f3f46, #52525b)'
                                                    : `linear-gradient(135deg, ${config.preview}, ${config.preview}dd)`,
                                                boxShadow: isNone
                                                    ? 'none'
                                                    : `0 0 20px ${config.preview}40, 0 0 40px ${config.preview}20`,
                                            }}
                                        />
                                        {isSelected && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Check className="h-5 w-5 text-white drop-shadow-md" />
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[11px] font-medium text-muted-foreground">
                                        {config.label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Live Preview */}
                <div className="pt-2 border-t">
                    <Label className="text-sm font-medium mb-3 block">Podgląd</Label>
                    <div className="flex items-center justify-center p-6 rounded-xl bg-muted/30">
                        {preferences.glowEnabled ? (
                            <div className="relative">
                                <div
                                    className="h-14 w-14 rounded-full flex items-center justify-center transition-all"
                                    style={{
                                        background: preferences.glowColor === 'none'
                                            ? 'linear-gradient(135deg, #3f3f46, #52525b)'
                                            : `linear-gradient(135deg, ${GLOW_COLOR_CONFIG[preferences.glowColor].preview}, ${GLOW_COLOR_CONFIG[preferences.glowColor].preview}cc)`,
                                        boxShadow: preferences.glowColor === 'none'
                                            ? '0 4px 6px rgba(0,0,0,0.3)'
                                            : `0 0 20px ${GLOW_COLOR_CONFIG[preferences.glowColor].preview}50, 0 0 40px ${GLOW_COLOR_CONFIG[preferences.glowColor].preview}30, 0 0 60px ${GLOW_COLOR_CONFIG[preferences.glowColor].preview}15`,
                                        animation: preferences.glowColor !== 'none' ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
                                    }}
                                >
                                    <Bot className="h-6 w-6 text-white" />
                                </div>
                                {preferences.glowColor !== 'none' && (
                                    <div
                                        className="absolute inset-0 rounded-full animate-ping opacity-20"
                                        style={{
                                            background: GLOW_COLOR_CONFIG[preferences.glowColor].preview,
                                        }}
                                    />
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <div className="h-14 w-14 rounded-full bg-zinc-600 flex items-center justify-center">
                                    <Bot className="h-6 w-6 text-zinc-300" />
                                </div>
                                <span className="text-xs">Poświata wyłączona</span>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
