'use client'

import { Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme, THEMES, type ThemeId, type ColorMode } from '@/lib/contexts/ThemeContext'

const ACCENTS: { id: ThemeId; label: string }[] = [
    { id: 'inframinds', label: 'Indygo' },
    { id: 'qualrix', label: 'Zielony' },
    { id: 'b2bnetwork', label: 'Różowy' },
]

/**
 * Theme controls: color mode (light/dark), accent palette (client skins mapped
 * to indigo/green/rose via [data-theme]).
 * Chrome stays neutral slate across all accents.
 */
export function ThemeMenu() {
    const { theme, setTheme, colorMode, setColorMode } = useTheme()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Motyw i akcent">
                    <Palette className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Tryb</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={colorMode}
                    onValueChange={(v) => setColorMode(v as ColorMode)}
                >
                    <DropdownMenuRadioItem value="light">Jasny</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">Ciemny</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Akcent</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={theme}
                    onValueChange={(v) => setTheme(v as ThemeId)}
                >
                    {ACCENTS.map((a) => (
                        <DropdownMenuRadioItem key={a.id} value={a.id}>
                            <span className="flex items-center gap-2">
                                <span
                                    className="inline-block h-3 w-3 rounded-full ring-1 ring-border"
                                    style={{ backgroundColor: THEMES[a.id].preview.primary }}
                                />
                                {a.label}
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
