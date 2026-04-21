'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

export function RiskDashboardMockup() {
    return (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-red-950/20 border-red-500/20">
                    <CardContent className="p-6">
                        <div className="text-4xl font-bold text-red-500 mb-1">3</div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Red Flags</div>
                    </CardContent>
                </Card>
                <Card className="bg-amber-950/20 border-amber-500/20">
                    <CardContent className="p-6">
                        <div className="text-4xl font-bold text-amber-500 mb-1">12</div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Expiring &lt;30d</div>
                    </CardContent>
                </Card>
                <Card className="bg-green-950/20 border-green-500/20">
                    <CardContent className="p-6">
                        <div className="text-4xl font-bold text-green-500 mb-1">156</div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Active</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Red Flags List */}
                <Card className="bg-card border-red-500/50 border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-bold text-red-500 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" /> Red Flags
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded bg-red-500 flex items-center justify-center text-white font-bold">!</div>
                            <div>
                                <div className="font-semibold text-white">Jan Kowalski - Nordea</div>
                                <div className="text-xs text-muted-foreground">Negatywny feedback klienta</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded bg-red-500 flex items-center justify-center text-white font-bold">!</div>
                            <div>
                                <div className="font-semibold text-white">Anna Nowak - BNP</div>
                                <div className="text-xs text-muted-foreground">Risk score &lt; 50%</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Expiring Contracts Chart (Mock) */}
                <Card className="bg-card border-white/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-bold text-white">Kontrakty kończące się</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end justify-between h-32 gap-2 mt-4">
                            <div className="w-full bg-red-500 rounded-t" style={{ height: '30%' }}></div>
                            <div className="w-full bg-amber-500 rounded-t" style={{ height: '45%' }}></div>
                            <div className="w-full bg-amber-500 rounded-t" style={{ height: '60%' }}></div>
                            <div className="w-full bg-green-500 rounded-t" style={{ height: '80%' }}></div>
                            <div className="w-full bg-green-500 rounded-t" style={{ height: '100%' }}></div>
                            <div className="w-full bg-green-500 rounded-t" style={{ height: '90%' }}></div>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-2 uppercase">
                            <span>7d</span><span>14d</span><span>30d</span><span>60d</span><span>90d</span><span>90d+</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
