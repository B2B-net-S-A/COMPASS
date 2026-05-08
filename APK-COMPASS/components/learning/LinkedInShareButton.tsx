'use client'

import { useState } from 'react'
import { Linkedin, Copy, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface LinkedInShareButtonProps {
    courseTitle: string
    courseId: string
}

/**
 * A1.3: LinkedIn Share button — daje studentowi szybki sposób na pochwalenie się
 * ukończeniem szkolenia w LinkedIn.
 *
 * MVP: shareUrl używa głównej strony aplikacji (publiczne weryfikowalne strony
 * certyfikatu są zaplanowane w Phase A2). LinkedIn pre-fills tekst z courseTitle.
 */
export function LinkedInShareButton({ courseTitle, courseId }: LinkedInShareButtonProps) {
    const [copied, setCopied] = useState(false)
    const summaryText = `Właśnie ukończyłem szkolenie "${courseTitle}" w ComPass Akademia 🎓 #ContinuousLearning #B2BNet`

    // Public-ish landing URL (TODO Phase A2: publiczna strona certyfikatu /cert/[hash])
    const shareUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/learning?ref=cert-${courseId.slice(0, 8)}`
        : ''

    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(summaryText)}`

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(`${summaryText}\n\n${shareUrl}`)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // ignore
        }
    }

    return (
        <Card className="bg-gradient-to-br from-blue-500/5 to-blue-700/5 border-blue-500/20">
            <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                        <Linkedin className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-sm mb-0.5">Pochwal się ukończeniem</h3>
                        <p className="text-xs text-muted-foreground">
                            Pokaż swojej sieci LinkedIn że właśnie zdobyłeś nową umiejętność.
                        </p>
                    </div>
                </div>

                <div className="p-3 rounded bg-white/5 border border-white/10 text-xs text-muted-foreground italic">
                    {summaryText}
                </div>

                <div className="flex flex-wrap gap-2">
                    <a
                        href={linkedInUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex"
                    >
                        <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                            <Linkedin className="w-3.5 h-3.5" />
                            Udostępnij na LinkedIn
                        </Button>
                    </a>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCopy}
                        className="gap-2"
                    >
                        {copied ? (
                            <>
                                <Check className="w-3.5 h-3.5" />
                                Skopiowano!
                            </>
                        ) : (
                            <>
                                <Copy className="w-3.5 h-3.5" />
                                Kopiuj tekst
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
