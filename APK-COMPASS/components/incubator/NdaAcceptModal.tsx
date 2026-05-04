'use client'

import { useState } from 'react'
import { Shield, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NDA_TEXT } from '@/lib/types/incubator'

interface NdaAcceptModalProps {
    open: boolean
    onAccept: (timestamp: string) => void
    onClose: () => void
}

export function NdaAcceptModal({ open, onAccept, onClose }: NdaAcceptModalProps) {
    const [accepted, setAccepted] = useState(false)
    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="relative max-w-2xl w-full bg-card border border-white/10 rounded-lg shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Zamknij oświadczenie"
                    className="absolute top-3 right-3 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                    <X className="w-5 h-5" aria-hidden="true" />
                </button>

                <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <Shield className="w-7 h-7 text-amber-400" />
                        <h2 className="text-xl font-bold">Oświadczenie poufności</h2>
                    </div>

                    <div className="max-h-72 overflow-y-auto p-4 bg-white/5 border border-white/10 rounded-lg text-sm text-muted-foreground whitespace-pre-wrap">
                        {NDA_TEXT}
                    </div>

                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={accepted}
                            onChange={(e) => setAccepted(e.target.checked)}
                            className="mt-1 accent-primary"
                        />
                        <span>Przeczytałem i akceptuję powyższe oświadczenie. Wiem, że nie zastępuje ono formalnej NDA.</span>
                    </label>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={onClose}>Anuluj</Button>
                        <Button
                            disabled={!accepted}
                            onClick={() => onAccept(new Date().toISOString())}
                        >
                            Akceptuję, kontynuuj
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
