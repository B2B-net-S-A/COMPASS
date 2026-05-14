'use client'

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import { ChartCard } from './ChartCard'

interface TrendLineChartProps {
    title: string
    subtitle?: string
    data: { label: string; value: number }[]
    color?: string
    className?: string
}

const tooltipStyle = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: 12,
    color: 'hsl(var(--foreground))',
}

export function TrendLineChart({ title, subtitle, data, color, className }: TrendLineChartProps) {
    if (data.length === 0) return null

    const strokeColor = color || 'hsl(var(--chart-1))'

    return (
        <ChartCard title={title} subtitle={subtitle} className={className}>
            <div className="h-[180px] sm:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                        <defs>
                            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis
                            dataKey="label"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                            axisLine={{ stroke: 'hsl(var(--border))' }}
                        />
                        <YAxis
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                            axisLine={{ stroke: 'hsl(var(--border))' }}
                            allowDecimals={false}
                            width={30}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={strokeColor}
                            strokeWidth={2}
                            fill="url(#trendGradient)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </ChartCard>
    )
}
