'use client'

import { useMemo } from 'react'
import { Video } from 'lucide-react'

interface EmbedVideoProps {
    url: string
    title?: string
}

export type VideoEmbedType = 'youtube' | 'vimeo' | 'loom' | 'wistia' | 'native_file'

export interface ParsedEmbed {
    type: VideoEmbedType
    embedUrl: string
}

const NATIVE_VIDEO_EXT = /\.(mp4|webm|ogg|mov)(\?.*)?$/i

/**
 * A2.6: rozszerzony parser URL — YouTube, Vimeo, Loom, Wistia, native file.
 * Whitelist iframe sources (security).
 *
 * Wspiera:
 *  - youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
 *  - vimeo.com/ID, player.vimeo.com/video/ID
 *  - loom.com/share/ID, loom.com/embed/ID
 *  - <ID>.wistia.com/medias/ID, fast.wistia.com/embed/medias/ID
 *  - bezpośrednie pliki .mp4/.webm/.ogg/.mov (native <video>)
 */
export function parseEmbedUrl(url: string): ParsedEmbed | null {
    const trimmed = url.trim()
    if (!trimmed) return null

    // YouTube
    const ytWatch = trimmed.match(/youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{6,})/)
    if (ytWatch) return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytWatch[1]}` }

    const ytShort = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/)
    if (ytShort) return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytShort[1]}` }

    const ytEmbed = trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/)
    if (ytEmbed) return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytEmbed[1]}` }

    // Vimeo
    const vimeoNumeric = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/)
    if (vimeoNumeric) return { type: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeoNumeric[1]}` }

    // Loom
    const loomShare = trimmed.match(/loom\.com\/(?:share|embed)\/([a-f0-9]{16,})/)
    if (loomShare) return { type: 'loom', embedUrl: `https://www.loom.com/embed/${loomShare[1]}` }

    // Wistia
    const wistiaMedia = trimmed.match(/wistia\.com\/(?:embed\/)?medias\/([a-z0-9]+)/)
    if (wistiaMedia) return { type: 'wistia', embedUrl: `https://fast.wistia.com/embed/medias/${wistiaMedia[1]}` }

    // Native video file (basic check by extension)
    if (NATIVE_VIDEO_EXT.test(trimmed) && (trimmed.startsWith('https://') || trimmed.startsWith('http://'))) {
        return { type: 'native_file', embedUrl: trimmed }
    }

    return null
}

/**
 * A2.6: zwraca przyjazny opis typu video dla form preview.
 */
export function describeEmbedType(parsed: ParsedEmbed | null): string {
    if (!parsed) return 'Nieobsługiwany format'
    switch (parsed.type) {
        case 'youtube':
            return 'YouTube'
        case 'vimeo':
            return 'Vimeo'
        case 'loom':
            return 'Loom'
        case 'wistia':
            return 'Wistia'
        case 'native_file':
            return 'Plik wideo'
    }
}

export function EmbedVideo({ url, title }: EmbedVideoProps) {
    const parsed = useMemo(() => parseEmbedUrl(url), [url])

    if (!parsed) {
        return (
            <div className="aspect-video w-full rounded-lg bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Video className="w-8 h-8" />
                <p>Nieobsługiwany format URL: {url}</p>
                <p className="text-xs text-muted-foreground/70">
                    Wspierane: YouTube, Vimeo, Loom, Wistia, .mp4/.webm
                </p>
                <a href={url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">
                    Otwórz w nowej karcie
                </a>
            </div>
        )
    }

    if (parsed.type === 'native_file') {
        return (
            <div className="aspect-video w-full rounded-lg overflow-hidden border border-white/10 bg-black">
                <video src={parsed.embedUrl} controls className="w-full h-full" preload="metadata">
                    Twoja przeglądarka nie wspiera tagu video.
                </video>
            </div>
        )
    }

    return (
        <div className="aspect-video w-full rounded-lg overflow-hidden border border-white/10 bg-black">
            <iframe
                src={parsed.embedUrl}
                title={title ?? 'Wideo lekcji'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
            />
        </div>
    )
}
