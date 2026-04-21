'use client'

import { useState, useEffect } from 'react'

interface ClientDateProps {
    date: string | Date
    format?: 'date' | 'datetime'
    locale?: string
    className?: string
    fallback?: string
}

export function ClientDate({
    date,
    format = 'date',
    locale = 'pl-PL',
    className,
    fallback = '—',
}: ClientDateProps) {
    const [formatted, setFormatted] = useState<string | null>(null)

    useEffect(() => {
        try {
            const d = new Date(date)
            setFormatted(
                format === 'datetime'
                    ? d.toLocaleString(locale)
                    : d.toLocaleDateString(locale)
            )
        } catch {
            setFormatted(fallback)
        }
    }, [date, format, locale, fallback])

    return <span className={className}>{formatted ?? fallback}</span>
}
