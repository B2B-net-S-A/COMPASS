'use client'

import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MessageCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { GuardianInfo, GuardianType } from '@/lib/actions/centrala-management'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<GuardianType, string> = {
    recruiter: 'Rekruter',
    delivery_lead: 'Delivery Lead',
}

const TYPE_DESCRIPTION: Record<GuardianType, string> = {
    recruiter: 'Sprawy kontraktowe, benefity, kontakt główny',
    delivery_lead: 'Projekt, zespół, sprawy operacyjne',
}

interface GuardianCardProps {
    guardian: GuardianInfo
}

export function GuardianCard({ guardian }: GuardianCardProps) {
    const initials = (guardian.full_name || '?')
        .split(' ')
        .map(p => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || '?'

    const lastMessageDate = guardian.last_message_at
        ? formatDistanceToNow(new Date(guardian.last_message_at), { addSuffix: true, locale: pl })
        : null

    return (
        <Link href={`/messages?with=${guardian.user_id}`} className="block group">
            <Card className="h-full bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                <CardContent className="p-5 flex gap-4">
                    <Avatar className="h-12 w-12 shrink-0">
                        {guardian.avatar_url && <AvatarImage src={guardian.avatar_url} alt={guardian.full_name} />}
                        <AvatarFallback className="bg-primary/20 text-primary font-medium">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0">
                                <div className="font-medium truncate group-hover:text-primary transition-colors">
                                    {guardian.full_name}
                                </div>
                                <Badge variant="outline" className="mt-1 text-[10px] h-4 px-1.5 border-primary/30 text-primary/80">
                                    {TYPE_LABEL[guardian.type]}
                                </Badge>
                            </div>
                            {guardian.unread_count > 0 && (
                                <span
                                    className="shrink-0 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-[10px] font-bold text-white"
                                    aria-label={`${guardian.unread_count} nieprzeczytanych wiadomości`}
                                >
                                    {guardian.unread_count > 9 ? '9+' : guardian.unread_count}
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground mb-2 line-clamp-1">
                            {guardian.last_message_preview ?? TYPE_DESCRIPTION[guardian.type]}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                            <MessageCircle className={cn('w-3 h-3', guardian.unread_count > 0 && 'text-red-400')} />
                            <span>
                                {lastMessageDate
                                    ? `Ostatnia wiadomość ${lastMessageDate}`
                                    : 'Rozpocznij rozmowę'}
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
