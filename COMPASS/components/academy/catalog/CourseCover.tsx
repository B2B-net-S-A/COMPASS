'use client'

import { useState } from 'react'
import Image from 'next/image'
import { BookOpen, Layers, Video } from 'lucide-react'
import type { CatalogDeliveryMode } from './catalog-filters'

export function CourseCover({ url, mode }: { url: string | null; mode: CatalogDeliveryMode }) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null)
    const safeUrl = url && (/^https:\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//'))) ? url : null
    const Icon = mode === 'live' ? Video : mode === 'blended' ? Layers : BookOpen

    return (
        <div className="relative h-40 overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-muted to-background">
            <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                <span className="absolute -right-4 -top-12 size-48 rounded-full border border-primary/10" />
                <span className="absolute -bottom-20 -left-8 size-56 rounded-full border border-primary/10" />
                <span className="rounded-2xl border border-primary/10 bg-background/60 p-5 text-primary/70 transition-transform duration-200 group-hover:-translate-y-1 motion-reduce:transform-none"><Icon className="size-9" strokeWidth={1.5} /></span>
            </div>
            {safeUrl && failedUrl !== safeUrl && (
                <Image src={safeUrl} alt="" fill unoptimized sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none" onError={() => setFailedUrl(safeUrl)} />
            )}
        </div>
    )
}
