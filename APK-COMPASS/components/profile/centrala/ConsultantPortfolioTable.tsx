'use client'

import React, { useState } from 'react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ConsultantSummary } from "@/lib/actions/centrala"
import { Search, Filter, MoreHorizontal, ArrowUpDown } from "lucide-react"

interface ConsultantPortfolioTableProps {
    data: ConsultantSummary[]
}

export function ConsultantPortfolioTable({ data }: ConsultantPortfolioTableProps) {
    const [filter, setFilter] = useState('')
    const [sortConfig, setSortConfig] = useState<{ key: keyof ConsultantSummary; direction: 'asc' | 'desc' } | null>(null)

    const handleSort = (key: keyof ConsultantSummary) => {
        let direction: 'asc' | 'desc' = 'asc'
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc'
        }
        setSortConfig({ key, direction })
    }

    const filteredData = data.filter(item =>
        item.full_name?.toLowerCase().includes(filter.toLowerCase()) ||
        item.email?.toLowerCase().includes(filter.toLowerCase())
    )

    const sortedData = React.useMemo(() => {
        if (!sortConfig) return filteredData
        return [...filteredData].sort((a, b) => {
            const aValue = a[sortConfig.key] || ''
            const bValue = b[sortConfig.key] || ''

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
            return 0
        })
    }, [filteredData, sortConfig])

    const getTierColor = (tier: string) => {
        switch (tier?.toLowerCase()) {
            case 'platinum': return 'bg-purple-100 text-purple-800 border-foreground'
            case 'gold': return 'bg-amber-100 text-amber-800 border-amber-200'
            case 'silver': return 'bg-slate-200 text-slate-800 border-slate-200'
            default: return 'bg-orange-100 text-orange-800 border-orange-200' // Bronze
        }
    }

    const getStatusColor = (status: string | null) => {
        switch (status) {
            case 'bench':
            case 'available':
                return 'destructive'
            case 'project':
            case 'busy':
                return 'default' // Primary/Green ish usually
            default:
                return 'secondary'
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 max-w-sm w-full">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Szukaj konsultanta..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="h-8"
                    />
                </div>
                {/* Future: Add more filters here */}
                <Button variant="outline" size="sm" className="h-8">
                    <Filter className="mr-2 h-4 w-4" />
                    Filtry
                </Button>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[250px] cursor-pointer" onClick={() => handleSort('full_name')}>
                                Konsultant <ArrowUpDown className="ml-2 h-3 w-3 inline" />
                            </TableHead>
                            <TableHead className="cursor-pointer" onClick={() => handleSort('current_status')}>Status</TableHead>
                            <TableHead className="cursor-pointer" onClick={() => handleSort('loyalty_tier')}>Tier</TableHead>
                            <TableHead className="text-right cursor-pointer" onClick={() => handleSort('loyalty_points')}>Punkty</TableHead>
                            <TableHead>Rola Compass</TableHead>
                            <TableHead className="text-right">Akcje</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    Brak wyników.
                                </TableCell>
                            </TableRow>
                        ) : (
                            sortedData.map((consultant) => (
                                <TableRow key={consultant.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={consultant.avatar_url || ''} />
                                                <AvatarFallback>{consultant.full_name?.[0] || 'U'}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <span>{consultant.full_name}</span>
                                                <span className="text-xs text-muted-foreground">{consultant.email}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusColor(consultant.current_status) as any}>
                                            {consultant.current_status || 'Nieznany'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${getTierColor(consultant.loyalty_tier)}`}>
                                            {consultant.loyalty_tier?.toUpperCase() || 'BRONZE'}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {consultant.loyalty_points || 0}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {consultant.ambassador_status === 'active' && <Badge variant="outline" className="text-xs text-burgundy border-blue-200">Ambasador</Badge>}
                                            {consultant.verifier_status === 'active' && <Badge variant="outline" className="text-xs text-burgundy border-foreground">Weryfikator</Badge>}
                                            {consultant.sales_support_status === 'active' && <Badge variant="outline" className="text-xs text-green-600 border-green-200">Wsparcie</Badge>}
                                            {(!consultant.ambassador_status && !consultant.verifier_status && !consultant.sales_support_status) &&
                                                <span className="text-xs text-muted-foreground">-</span>
                                            }
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end">
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
