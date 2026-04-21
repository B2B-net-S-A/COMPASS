'use client'

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts'
import { ChartCard } from './ChartCard'

interface StatusBarChartProps {
    title: string
    subtitle?: string
    data: { name: string; value: number; color: string }[]
    className?: string
}

const tooltipStyle = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: 12,
    color: 'hsl(var(--foreground))',
}

export function StatusBarChart({ title, subtitle, data, className }: StatusBarChartProps) {
    if (data.length === 0) return null

    return (
        <ChartCard title={title} subtitle={subtitle} className={className}>
            <div className="h-[180px] sm:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                            axisLine={{ stroke: 'hsl(var(--border))' }}
                            interval={0}
                            angle={-30}
                            textAnchor="end"
                            height={40}
                        />
                        <YAxis
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                            axisLine={{ stroke: 'hsl(var(--border))' }}
                            allowDecimals={false}
                            width={30}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </ChartCard>
    )
}
