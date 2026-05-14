'use client'

import { useEffect, useState } from 'react'

export function AmbientGlow() {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    return (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-primary/5 opacity-50" />
            <style jsx global>{`
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: inset 0 0 50px hsl(var(--primary) / 0.08); }
                    50% { box-shadow: inset 0 0 120px hsl(var(--primary) / 0.18); }
                }
                .light .animate-pulse-glow {
                    animation: none;
                }
                .animate-pulse-glow {
                    animation: pulse-glow 4s ease-in-out infinite;
                }
            `}</style>
            <div className="absolute inset-0 animate-pulse-glow pointer-events-none" />
        </div>
    )
}
