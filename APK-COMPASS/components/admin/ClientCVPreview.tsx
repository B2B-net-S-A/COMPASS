'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { ExternalLink, Loader2 } from 'lucide-react'

interface ClientCVPreviewProps {
    url: string
    isPdf: boolean
}

export function ClientCVPreview({ url, isPdf }: ClientCVPreviewProps) {
    const [isLoading, setIsLoading] = useState(true)

    // Helper to handleiframe load
    const handleLoad = () => {
        setIsLoading(false)
    }

    return (
        <div className="w-full h-full flex flex-col relative bg-white/5">
            {/* Loading Indicator */}
            {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/20 backdrop-blur-sm">
                    <Loader2 className="w-8 h-8 text-slate-200 animate-spin mb-2" />
                    <span className="text-sm text-slate-200">Ładowanie podglądu...</span>
                </div>
            )}

            {/* Viewer */}
            <div className="flex-1 w-full h-full relative">
                {isPdf ? (
                    <iframe
                        src={url}
                        className="w-full h-full border-none"
                        title="CV Preview"
                        loading="lazy"
                        onLoad={handleLoad}
                    />
                ) : (
                    <iframe
                        src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
                        className="w-full h-full border-none"
                        title="CV Preview"
                        loading="lazy"
                        onLoad={handleLoad}
                    />
                )}
            </div>

            {/* Fallback / Footer */}
            <div className="p-2 bg-black/40 border-t border-white/10 flex justify-between items-center text-xs text-muted-foreground">
                <span>
                    {isPdf ? 'Przeglądarka PDF' : 'Google Docs Viewer'}
                </span>
                <Button variant="link" size="sm" asChild className="h-auto p-0 text-slate-200 hover:text-foreground">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                        Otwórz w nowym oknie <ExternalLink className="w-3 h-3" />
                    </a>
                </Button>
            </div>
        </div>
    )
}
