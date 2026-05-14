'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Contract } from "@/lib/types"
import { Calendar, Briefcase, AlertTriangle, CheckCircle2, Clock } from "lucide-react"

interface ContractStatusWidgetProps {
    contract: Contract | null
}

export function ContractStatusWidget({ contract }: ContractStatusWidgetProps) {
    if (!contract) {
        return (
            <Card className="bg-white/5 border-white/10 h-full card-hover">
                <CardHeader>
                    <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                        <Briefcase className="w-4 h-4" />
                        Status Kontraktu
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
                        <Briefcase className="w-6 h-6 text-slate-600" />
                    </div>
                    <p className="text-slate-300 font-medium">Brak aktywnego kontraktu</p>
                    <p className="text-xs text-slate-600 mt-1 max-w-[200px]">
                        Skontaktuj się ze swoim opiekunem lub przeglądaj nowe projekty.
                    </p>
                </CardContent>
            </Card>
        )
    }

    // Calculate progress
    const startDate = new Date(contract.start_date)
    const endDate = new Date(contract.end_date)
    const today = new Date()

    const totalDuration = endDate.getTime() - startDate.getTime()
    const elapsed = today.getTime() - startDate.getTime()
    const progress = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100)

    // Days remaining
    const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const isEndingSoon = daysRemaining <= 30 && daysRemaining > 0

    return (
        <Card className="bg-white/5 border-white/10 h-full card-hover">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                        <Briefcase className="w-4 h-4" />
                        Status Kontraktu
                    </CardTitle>
                    {isEndingSoon && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            Kończy się
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <p className="text-lg font-bold text-white leading-none">{contract.client_name}</p>
                            <p className="text-xs text-slate-600 mt-1">{contract.project_name}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-600 uppercase tracking-wider">Pozostało</p>
                            <p className={`text-xl font-mono font-bold ${isEndingSoon ? 'text-amber-400' : 'text-slate-200'}`}>
                                {daysRemaining} dni
                            </p>
                        </div>
                    </div>

                    <Progress value={progress} className={`h-2 ${isEndingSoon ? 'bg-amber-950' : 'bg-slate-800'}`} indicatorClassName={isEndingSoon ? 'bg-amber-500' : 'bg-primary'} />

                    <div className="flex justify-between mt-2 text-xs text-slate-600 font-mono">
                        <span>{new Date(contract.start_date).toLocaleDateString('pl-PL')}</span>
                        <span>{new Date(contract.end_date).toLocaleDateString('pl-PL')}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                    <div className="p-2 rounded bg-black/20">
                        <p className="text-[10px] text-slate-600 uppercase">Stanowisko</p>
                        <p className="text-xs font-medium text-slate-200 truncate" title={contract.position}>{contract.position}</p>
                    </div>
                    <div className="p-2 rounded bg-black/20">
                        <p className="text-[10px] text-slate-600 uppercase">Tryb Pracy</p>
                        <p className="text-xs font-medium text-slate-200 capitalize">
                            {contract.work_mode === 'hybrid' ? 'Hybrydowy' :
                                contract.work_mode === 'remote' ? 'Zdalny' : 'Stacjonarny'}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
