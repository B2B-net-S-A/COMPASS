'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { ChartCard } from './ChartCard'

interface DistributionPieChartProps {
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

export function DistributionPieChart({ title, subtitle, data, className }: DistributionPieChartProps) {
    if (data.length === 0 || data.every(d => d.value === 0)) return null

    return (
        <ChartCard title={title} subtitle={subtitle} className={className}>
            <div className="h-[180px] sm:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="45%"
                            innerRadius={40}
                            outerRadius={65}
                            paddingAngle={3}
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </ChartCard>
    )
}
