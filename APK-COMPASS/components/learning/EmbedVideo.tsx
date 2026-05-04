'use client'

import { useMemo } from 'react'
import { Video } from 'lucide-react'

interface EmbedVideoProps {
    url: string
    title?: string
}

interface ParsedEmbed {
    type: 'youtube' | 'vimeo'
    embedUrl: string
}

/**
 * Parsuje URL YouTube lub Vimeo i zwraca URL osadzania (embed).
 * Wspiera:
 *  - youtube.com/watch?v=ID
 *  - youtu.be/ID
 *  - youtube.com/embed/ID
 *  - vimeo.com/ID
 *  - player.vimeo.com/video/ID
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

    return null
}

export function EmbedVideo({ url, title }: EmbedVideoProps) {
    const parsed = useMemo(() => parseEmbedUrl(url), [url])

    if (!parsed) {
        return (
            <div className="aspect-video w-full rounded-lg bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Video className="w-8 h-8" />
                <p>Nieobsługiwany format URL: {url}</p>
                <a href={url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">
                    Otwórz w nowej karcie
                </a>
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
