// Phase 25d — informational list of approved leaves where Compass detected
// a user-set Out-of-Office in Outlook and intentionally did NOT overwrite it.
// No retry button — preservation is the intended behavior.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Info, UserCheck } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { type PendingLeaveRow } from '@/lib/actions/internal-leave'

interface Props {
    requests: PendingLeaveRow[]
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    sick_leave: 'L4',
    parental_leave: 'Opieka rodzicielska',
    unpaid_leave: 'Urlop bezpłatny',
    training: 'Szkolenie',
    on_demand: 'Urlop na żądanie',
    occasional: 'Urlop okolicznościowy',
    childcare: 'Opieka nad dzieckiem (art. 188)',
    care_leave: 'Urlop opiekuńczy',
    force_majeure: 'Siła wyższa',
    maternity: 'Urlop macierzyński',
    paternity: 'Urlop ojcowski',
    childrearing: 'Urlop wychowawczy',
    blood_donation: 'Krwiodawstwo',
    holiday_in_lieu: 'Odbiór dnia za święto',
    other: 'Inne',
}

function getInitials(name: string | null, email: string): string {
    if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    return email.slice(0, 2).toUpperCase()
}

function fmt(d: string): string {
    return format(parseISO(d), 'd LLL yyyy', { locale: pl })
}

export function AdminLeavePreservedOof({ requests }: Props) {
    if (requests.length === 0) return null

    return (
        <Card className="border-info/30 bg-info/5">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-info">
                    <Info className="h-4 w-4" />
                    OOF pominięty — pracownik ma własny auto-reply ({requests.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    Compass wykrył, że pracownik ma już ustawiony własny Out-of-Office w Outlooku, i nie nadpisał go.
                    Reszta synchronizacji (kalendarz, push, email do zastępcy) zadziałała normalnie.
                </p>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {requests.map((req) => (
                        <div
                            key={req.id}
                            className="border rounded-lg p-3 flex items-start gap-3"
                        >
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={req.user_avatar_url || undefined} />
                                <AvatarFallback className="text-[10px]">
                                    {getInitials(req.user_full_name, req.user_email)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm">
                                        {req.user_full_name ?? req.user_email}
                                    </span>
                                    <Badge variant="outline" className="text-[10px]">
                                        {LEAVE_TYPE_LABEL[req.leave_type] ?? req.leave_type}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {fmt(req.start_date)} – {fmt(req.end_date)}
                                </p>
                                {req.substitute_full_name && (
                                    <p className="text-xs mt-1 inline-flex items-center gap-1 text-muted-foreground">
                                        <UserCheck className="h-3 w-3" />
                                        Zastępca: {req.substitute_full_name}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
