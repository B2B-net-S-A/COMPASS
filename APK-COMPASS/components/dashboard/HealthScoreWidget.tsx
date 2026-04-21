'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Heart } from "lucide-react"

interface HealthScoreWidgetProps {
    score: number | undefined | null
}

export function HealthScoreWidget({ score }: HealthScoreWidgetProps) {
    // Determine color based on score
    const getColor = (s: number) => {
        if (s >= 80) return "text-green-500"
        if (s >= 50) return "text-yellow-500"
        return "text-red-500"
    }

    // If no score is available (e.g. new contract), show a neutral state
    if (score === null || score === undefined) {
        return (
            <Card className="bg-white/5 border-white/10 h-full flex flex-col items-center justify-center p-6 text-center card-hover">
                <div className="bg-slate-800/50 p-3 rounded-full mb-3">
                    <Activity className="w-6 h-6 text-slate-600" />
                </div>
                <p className="text-sm font-medium text-slate-300">Health Score</p>
                <p className="text-xs text-slate-600 mt-1">
                    Wskaźnik dostępny po pierwszym miesiącu współpracy.
                </p>
            </Card>
        )
    }

    const colorClass = getColor(score)

    // Dynamic message
    const getMessage = (s: number) => {
        if (s >= 90) return "Wzorowa współpraca! Tak trzymaj."
        if (s >= 80) return "Współpraca przebiega stabilnie."
        if (s >= 60) return "Warto zadbać o częstszy kontakt."
        return "Wymagana uwaga opiekuna."
    }

    return (
        <Card className="bg-white/5 border-white/10 h-full card-hover">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Health Score
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pt-2">
                <div className="relative w-24 h-24 flex items-center justify-center mb-2">
                    {/* Background Circle */}
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle
                            cx="50" cy="50" r="45"
                            fill="none"
                            stroke="#1e293b"
                            strokeWidth="8"
                        />
                        {/* Progress Circle (Simplified) */}
                        <circle
                            cx="50" cy="50" r="45"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="8"
                            strokeDasharray={`${score * 2.8} 280`}
                            strokeLinecap="round"
                            className={`${colorClass} transition-all duration-1000 ease-out`}
                            transform="rotate(-90 50 50)"
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                        <span className={`text-2xl font-bold ${colorClass}`}>{score}%</span>
                    </div>
                </div>

                <div className="text-center">
                    <p className="text-sm font-medium text-white mb-1">Stabilny kontrakt</p>
                    <p className="text-xs text-slate-600">{getMessage(score)}</p>
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-600 uppercase tracking-widest opacity-60">
                    <Heart className="w-3 h-3 fill-current" />
                    Powered by AI
                </div>
            </CardContent>
        </Card>
    )
}
