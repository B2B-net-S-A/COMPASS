'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createTicket } from '@/lib/actions/support-tickets'
import type { SupportCategory, TicketPriority } from '@/lib/types/support'
import { TICKET_PRIORITY_LABEL } from '@/lib/types/support'

export type ComposerMode = 'formal' | 'chat'

interface TicketComposerProps {
    categories: SupportCategory[]
    defaultCategoryId?: string
    defaultSubject?: string
    defaultBody?: string
    defaultAssigneeId?: string
    /**
     * 'formal' — full ticket form (subject + priority + long description)
     * 'chat'   — single textarea + Send, subject auto-generated from category
     */
    mode?: ComposerMode
}

const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent']

export function TicketComposer({
    categories,
    defaultCategoryId,
    defaultSubject,
    defaultBody,
    defaultAssigneeId,
    mode = 'formal',
}: TicketComposerProps) {
    const router = useRouter()
    const [categoryId, setCategoryId] = useState(defaultCategoryId ?? categories[0]?.id ?? '')
    const [subject, setSubject] = useState(defaultSubject ?? '')
    const [body, setBody] = useState(defaultBody ?? '')
    const [priority, setPriority] = useState<TicketPriority>('normal')
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const isChat = mode === 'chat'
    const selectedCategory = categories.find((c) => c.id === categoryId)
    const minSubject = isChat ? 1 : 3
    const minBody = isChat ? 1 : 10
    const canSubmit = !isPending && body.trim().length >= minBody && categoryId &&
        (isChat || subject.trim().length >= minSubject)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
            // In chat mode auto-generate the subject from the category name + first words of body.
            const finalSubject = isChat
                ? `Czat: ${selectedCategory?.name_pl ?? 'Wiadomość'} — ${body.trim().slice(0, 60)}`
                : subject

            const result = await createTicket({
                category_id: categoryId,
                subject: finalSubject,
                body_md: body,
                priority: isChat ? 'normal' : priority,
                assignee_id: defaultAssigneeId,
                is_chat: isChat,
            })
            if (!result.success) {
                setError(result.error)
                return
            }
            router.push(`/support/tickets/${result.data.ticketId}`)
        })
    }

    if (isChat) {
        return (
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}

                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-5 space-y-4">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                                Temat: <span className="text-primary font-medium">{selectedCategory?.name_pl ?? '—'}</span>
                            </label>
                            <Textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                rows={4}
                                placeholder="Napisz pierwszą wiadomość…"
                                disabled={isPending}
                                required
                                minLength={1}
                                autoFocus
                            />
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button type="submit" disabled={!canSubmit} className="gap-2">
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Rozpocznij rozmowę
                    </Button>
                </div>
            </form>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Kategoria <span className="text-red-400">*</span></label>
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                disabled={isPending}
                                required
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-primary/50"
                            >
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name_pl}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Priorytet</label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                                disabled={isPending}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-primary/50"
                            >
                                {PRIORITIES.map((p) => (
                                    <option key={p} value={p}>{TICKET_PRIORITY_LABEL[p]}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Tytuł <span className="text-red-400">*</span></label>
                        <Input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Krótki opis problemu"
                            disabled={isPending}
                            required
                            minLength={3}
                        />
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Opis <span className="text-red-400">*</span></label>
                        <Textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={8}
                            placeholder="Co się dzieje, kiedy to się zaczęło, co już próbowałeś..."
                            disabled={isPending}
                            required
                            minLength={10}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Markdown obsługiwany.</p>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
                <Button type="submit" disabled={!canSubmit} className="gap-2">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Wyślij ticket
                </Button>
            </div>
        </form>
    )
}
