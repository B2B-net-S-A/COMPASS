'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { CategoryBreakdown } from '@/lib/actions/loyalty'

const COLORS = [
    'hsl(var(--primary))',
    '#f59e0b',
    '#10b981',
    '#8b5cf6',
    '#ef4444',
    '#06b6d4',
    '#ec4899',
]

interface Props {
    categories: CategoryBreakdown[]
    totalPoints: number
}

export function LoyaltyBreakdownChart({ categories, totalPoints }: Props) {
    const data = categories
        .filter(c => c.totalPoints > 0)
        .map((c, i) => ({
            name: c.category,
            value: c.totalPoints,
            percentage: c.percentage,
            color: COLORS[i % COLORS.length],
        }))

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                Brak danych do wyświetlenia
            </div>
        )
    }

    return (
        <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-[200px] h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={2}
                            dataKey="value"
                        >
                            {data.map((entry, i) => (
                                <Cell key={i} fill={entry.color} stroke="none" />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value: number) => [`${value.toLocaleString('pl-PL')} pkt`, '']}
                            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '13px' }}
                        />
                        <text x="50%" y="46%" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-2xl font-bold">
                            {totalPoints.toLocaleString('pl-PL')}
                        </text>
                        <text x="50%" y="58%" textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground text-xs">
                            punktów
                        </text>
                    </PieChart>
                </ResponsiveContainer>
            </div>

            <div className="flex-1 space-y-2 min-w-0">
                {data.map((entry, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-sm flex-1 truncate">{entry.name}</span>
                        <span className="text-sm font-mono font-medium tabular-nums">
                            {entry.value.toLocaleString('pl-PL')}
                        </span>
                        <span className="text-xs text-muted-foreground w-10 text-right">{entry.percentage}%</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
