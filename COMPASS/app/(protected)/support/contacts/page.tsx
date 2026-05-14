import Link from 'next/link'
import { Users, ArrowLeft, MessageSquarePlus, MessageCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { listSupportCategories, listTickets } from '@/lib/actions/support-tickets'
import { TICKET_STATUS_LABEL } from '@/lib/types/support'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

export default async function SupportChatPage() {
    const [categoriesResult, ticketsResult] = await Promise.all([
        listSupportCategories(),
        listTickets({ scope: 'mine', limit: 20 }),
    ])

    const categories = categoriesResult.success ? categoriesResult.data : []
    const allTickets = ticketsResult.success ? ticketsResult.data.items : []
    const activeThreads = allTickets.filter((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'waiting_user')

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
            <div>
                <Link href="/support" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Support Center
                </Link>
                <div className="flex items-center gap-3">
                    <Users className="w-8 h-8 text-primary" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Pogadaj z opiekunem</h1>
                        <p className="text-muted-foreground text-sm">
                            Wybierz temat i napisz wiadomość — odezwie się ktoś z Centrali. Możesz mieć kilka rozmów jednocześnie.
                        </p>
                    </div>
                </div>
            </div>

            {/* Start new chat — pick a topic */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <MessageSquarePlus className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Nowa rozmowa</h2>
                </div>
                {categories.length === 0 ? (
                    <Card className="bg-red-500/5 border-red-500/20">
                        <CardContent className="p-4 text-sm text-red-400">
                            Nie udało się załadować kategorii. Spróbuj odświeżyć stronę.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
                        {categories.map((c) => (
                            <Link
                                key={c.id}
                                href={`/support/tickets/new?chat=${c.slug}`}
                                className="block group"
                            >
                                <Card className="h-full bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                                    <CardContent className="p-4 flex flex-col items-start gap-2">
                                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                            <MessageSquarePlus className="w-4 h-4 text-primary" />
                                        </div>
                                        <div>
                                            <div className="font-medium group-hover:text-primary transition-colors">{c.name_pl}</div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            {/* Active threads */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <MessageCircle className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Moje rozmowy {activeThreads.length > 0 && <span className="text-primary/70">({activeThreads.length})</span>}
                    </h2>
                </div>
                {activeThreads.length === 0 ? (
                    <Card className="bg-white/5 border-white/10 border-dashed">
                        <CardContent className="p-5 text-sm text-muted-foreground">
                            Nie masz jeszcze żadnych aktywnych rozmów. Zacznij od wybrania tematu powyżej.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-2">
                        {activeThreads.map((t) => (
                            <Link
                                key={t.id}
                                href={`/support/tickets/${t.id}`}
                                className="block group"
                            >
                                <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                                    <CardContent className="p-4 flex items-center gap-4">
                                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                            <MessageCircle className="w-4 h-4 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground/80 mb-0.5">
                                                <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px]">{t.category_name_pl}</span>
                                                <span>·</span>
                                                <span>{TICKET_STATUS_LABEL[t.status]}</span>
                                                <span>·</span>
                                                <span>{formatDistanceToNow(new Date(t.updated_at), { addSuffix: true, locale: pl })}</span>
                                            </div>
                                            <div className="font-medium truncate group-hover:text-primary transition-colors">
                                                {t.subject}
                                            </div>
                                        </div>
                                        {t.comment_count > 0 && (
                                            <span className="shrink-0 text-[10px] text-muted-foreground">
                                                {t.comment_count} {t.comment_count === 1 ? 'wiadomość' : 'wiadomości'}
                                            </span>
                                        )}
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
