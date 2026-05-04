'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, Lock } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { addComment, changeTicketStatus } from '@/lib/actions/support-tickets'
import type { SupportComment, TicketStatus } from '@/lib/types/support'
import { TICKET_STATUS_LABEL } from '@/lib/types/support'
import { cn } from '@/lib/utils'

interface TicketChatProps {
    ticketId: string
    comments: SupportComment[]
    canReply: boolean
    canChangeStatus: boolean
    canMarkInternal: boolean
    currentUserId: string
    currentStatus: TicketStatus
}

const STATUS_FLOW: TicketStatus[] = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed']

export function TicketChat({ ticketId, comments, canReply, canChangeStatus, canMarkInternal, currentUserId, currentStatus }: TicketChatProps) {
    const router = useRouter()
    const [body, setBody] = useState('')
    const [internal, setInternal] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isSending, startSending] = useTransition()
    const [isStatusUpdating, startStatusUpdating] = useTransition()

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault()
        if (!body.trim()) return
        setError(null)
        startSending(async () => {
            const result = await addComment(ticketId, body, internal)
            if (!result.success) {
                setError(result.error)
                return
            }
            setBody('')
            setInternal(false)
            router.refresh()
        })
    }

    const handleStatusChange = (newStatus: TicketStatus) => {
        startStatusUpdating(async () => {
            const result = await changeTicketStatus(ticketId, newStatus)
            if (!result.success) {
                setError(result.error)
                return
            }
            router.refresh()
        })
    }

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                {comments.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground border border-dashed border-white/10 rounded-lg">
                        Brak odpowiedzi. Dodaj komentarz aby kontynuować rozmowę.
                    </div>
                ) : (
                    comments.map((c) => {
                        const isMine = c.author_id === currentUserId
                        const initials = (c.author_name ?? '?').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
                        return (
                            <div key={c.id} className={cn('flex gap-3', isMine && 'flex-row-reverse')}>
                                <Avatar className="h-8 w-8 shrink-0">
                                    <AvatarFallback className="text-[10px] bg-white/5">{initials}</AvatarFallback>
                                </Avatar>
                                <div className={cn('flex-1 max-w-[75%]', isMine && 'text-right')}>
                                    <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                                        <span className="font-medium">{c.author_name ?? 'Anonim'}</span>
                                        <span>·</span>
                                        <span>{new Date(c.created_at).toLocaleString('pl-PL')}</span>
                                        {c.is_internal && (
                                            <span className="inline-flex items-center gap-1 text-amber-400">
                                                <Lock className="w-3 h-3" /> wewnętrzny
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        className={cn(
                                            'inline-block p-3 rounded-lg whitespace-pre-wrap text-sm break-words',
                                            isMine ? 'bg-primary/10 border border-primary/20' : 'bg-white/5 border border-white/10',
                                            c.is_internal && 'border-amber-500/30 bg-amber-500/5',
                                        )}
                                    >
                                        {c.body_md}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {canReply && currentStatus !== 'closed' && (
                <form onSubmit={handleSend} className="space-y-3 pt-3 border-t border-white/5">
                    {error && <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>}

                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={3}
                        placeholder="Twoja odpowiedź..."
                        disabled={isSending}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                            {canMarkInternal && (
                                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={internal}
                                        onChange={(e) => setInternal(e.target.checked)}
                                        className="accent-amber-500"
                                    />
                                    Wewnętrzny komentarz (niewidoczny dla zgłaszającego)
                                </label>
                            )}
                        </div>
                        <Button type="submit" size="sm" disabled={isSending || !body.trim()} className="gap-2">
                            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Wyślij
                        </Button>
                    </div>
                </form>
            )}

            {canChangeStatus && (
                <div className="pt-3 border-t border-white/5">
                    <p className="text-xs text-muted-foreground mb-2">Zmień status:</p>
                    <div className="flex flex-wrap gap-2">
                        {STATUS_FLOW.filter((s) => s !== currentStatus).map((s) => (
                            <Button
                                key={s}
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isStatusUpdating}
                                onClick={() => handleStatusChange(s)}
                            >
                                → {TICKET_STATUS_LABEL[s]}
                            </Button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
