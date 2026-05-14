'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { TimelineMonth } from '@/lib/actions/loyalty'

const CATEGORY_COLORS: Record<string, string> = {
    Performance: 'hsl(var(--primary))',
    Loyalty: '#f59e0b',
    Compass: '#10b981',
    Quality: '#8b5cf6',
    Recruitment: '#ef4444',
    Development: '#06b6d4',
    Inne: '#6b7280',
}

const MONTH_LABELS: Record<string, string> = {
    '01': 'Sty', '02': 'Lut', '03': 'Mar', '04': 'Kwi',
    '05': 'Maj', '06': 'Cze', '07': 'Lip', '08': 'Sie',
    '09': 'Wrz', '10': 'Paź', '11': 'Lis', '12': 'Gru',
}

interface Props {
    timeline: TimelineMonth[]
}

export function LoyaltyTimeline({ timeline }: Props) {
    const allCategories = new Set<string>()
    for (const m of timeline) {
        for (const cat of Object.keys(m.breakdown)) {
            allCategories.add(cat)
        }
    }

    const data = timeline.map(m => {
        const parts = m.month.split('-')
        const label = `${MONTH_LABELS[parts[1]] || parts[1]} ${parts[0].slice(2)}`
        return { name: label, ...m.breakdown, total: m.points }
    })

    const categories = Array.from(allCategories)

    if (data.every(d => d.total === 0)) {
        return (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                Brak danych w wybranym okresie
            </div>
        )
    }

    return (
        <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '13px' }}
                        formatter={(value: number, name: string) => [`${value} pkt`, name]}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                        iconType="circle"
                        iconSize={8}
                    />
                    {categories.map(cat => (
                        <Bar
                            key={cat}
                            dataKey={cat}
                            stackId="a"
                            fill={CATEGORY_COLORS[cat] || '#6b7280'}
                            radius={categories.indexOf(cat) === categories.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
