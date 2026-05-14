'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { QuickAction } from "@/lib/types"
import { useRouter } from "next/navigation"
import { ArrowRight, Zap } from "lucide-react"

interface QuickActionsProps {
    actions: QuickAction[]
}

export function QuickActions({ actions }: QuickActionsProps) {
    const router = useRouter()

    return (
        <Card className="bg-white/5 border-white/10 h-full card-hover">
            <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Szybkie Akcje
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {actions.map((action) => (
                        <Button
                            key={action.id}
                            variant="outline"
                            className="h-auto py-4 flex flex-col items-start gap-1 border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
                            onClick={() => router.push(action.url)}
                        >
                            <div className="flex items-center justify-between w-full">
                                <span className="text-2xl mb-1">{action.icon}</span>
                                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
                            </div>
                            <span className="font-semibold text-sm">{action.title_pl}</span>
                            <span className="text-xs text-slate-600 font-normal text-left leading-tight">
                                {action.description_pl}
                            </span>
                        </Button>
                    ))}

                    {/* Placeholder for "Zgłoś urlop" - future feature */}
                    <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col items-start gap-1 border-white/5 bg-white/5 opacity-50 cursor-not-allowed"
                        disabled
                    >
                        <div className="flex items-center justify-between w-full">
                            <span className="text-2xl mb-1">🏖️</span>
                        </div>
                        <span className="font-semibold text-sm">Zgłoś urlop</span>
                        <span className="text-xs text-slate-600 font-normal text-left leading-tight">
                            Wkrótce dostępne
                        </span>
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
