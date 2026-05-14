'use client'

// Phase 17b R4 — Activity rate sparkline (Hubstaff-style 0-100% per 10-min bucket).
// Critical: ONLY shown to the user themselves on their own ClockPanel.
// Never rendered for admin viewing another user's data.

import { useMemo } from 'react'
import type { ActivityRateBucket } from '@/lib/actions/internal-clock'

interface Props {
    buckets: ActivityRateBucket[]
    height?: number
}

const MIN_SAMPLE_SIZE = 5

export function ActivityRateSparkline({ buckets, height = 48 }: Props) {
    const usable = useMemo(
        () => buckets.filter((b) => b.sampleSize >= MIN_SAMPLE_SIZE),
        [buckets],
    )

    if (usable.length < 2) {
        return (
            <div className="text-xs text-muted-foreground italic py-2">
                Za mało danych do wykresu aktywności (min 2 bucketów po 10 min).
            </div>
        )
    }

    const width = 600
    const padding = 4
    const innerWidth = width - 2 * padding
    const innerHeight = height - 2 * padding

    const stepX = innerWidth / Math.max(1, usable.length - 1)
    const points = usable
        .map((b, i) => {
            const x = padding + i * stepX
            const y = padding + innerHeight * (1 - b.rate / 100)
            return `${x.toFixed(1)},${y.toFixed(1)}`
        })
        .join(' ')

    const avg = Math.round(usable.reduce((s, b) => s + b.rate, 0) / usable.length)
    const peak = usable.reduce((max, b) => (b.rate > max.rate ? b : max), usable[0])
    const peakLocal = new Date(peak.bucketStart).toLocaleTimeString('pl-PL', {
        hour: '2-digit',
        minute: '2-digit',
    })

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Aktywność (10-min bucketów)</span>
                <span>
                    Średnia <strong className="text-foreground">{avg}%</strong> · peak{' '}
                    <strong className="text-foreground">
                        {peak.rate}% o {peakLocal}
                    </strong>
                </span>
            </div>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-auto"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Activity rate sparkline, average ${avg}%, peak ${peak.rate}% at ${peakLocal}`}
            >
                <line
                    x1={padding}
                    x2={width - padding}
                    y1={padding + innerHeight / 2}
                    y2={padding + innerHeight / 2}
                    stroke="currentColor"
                    strokeOpacity="0.15"
                    strokeDasharray="2 4"
                />
                <polyline
                    points={points}
                    fill="none"
                    stroke="rgb(59 130 246)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {/* peak dot */}
                {usable.map((b, i) =>
                    b === peak ? (
                        <circle
                            key={i}
                            cx={padding + i * stepX}
                            cy={padding + innerHeight * (1 - b.rate / 100)}
                            r={3}
                            fill="rgb(59 130 246)"
                        />
                    ) : null,
                )}
            </svg>
            <p className="text-[10px] text-muted-foreground italic">
                Te dane są prywatne — admin nie widzi szczegółowej aktywności, tylko sumę godzin w timesheet.
            </p>
        </div>
    )
}
