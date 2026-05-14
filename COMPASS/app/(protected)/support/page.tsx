import Link from 'next/link'
import { LifeBuoy, Plus, BookOpen, MessageCircleQuestion, Users } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default function SupportLandingPage() {
    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <LifeBuoy className="w-8 h-8 text-primary" />
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Support Center</h1>
                    <p className="text-muted-foreground text-sm">Tickety, baza wiedzy, chat z opiekunem.</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Link href="/support/contacts" className="block group">
                    <Card className="h-full bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                        <CardHeader>
                            <Users className="w-7 h-7 text-primary mb-2" />
                            <CardTitle className="text-lg group-hover:text-primary">Pogadaj z opiekunem</CardTitle>
                            <CardDescription>Wybierz temat i napisz wiadomość — Centrala odpowie w wątku.</CardDescription>
                        </CardHeader>
                    </Card>
                </Link>

                <Link href="/support/tickets/new" className="block group">
                    <Card className="h-full bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                        <CardHeader>
                            <Plus className="w-7 h-7 text-primary mb-2" />
                            <CardTitle className="text-lg group-hover:text-primary">Zgłoś problem</CardTitle>
                            <CardDescription>HR, IT, finanse, benefity, sprzęt — wybierz kategorię i opisz sytuację.</CardDescription>
                        </CardHeader>
                    </Card>
                </Link>

                <Link href="/support/kb" className="block group">
                    <Card className="h-full bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                        <CardHeader>
                            <BookOpen className="w-7 h-7 text-primary mb-2" />
                            <CardTitle className="text-lg group-hover:text-primary">Baza wiedzy</CardTitle>
                            <CardDescription>Procedury HR, instrukcje benefitów, onboarding, IT.</CardDescription>
                        </CardHeader>
                    </Card>
                </Link>

                <Link href="/support/tickets" className="block group">
                    <Card className="h-full bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                        <CardHeader>
                            <MessageCircleQuestion className="w-7 h-7 text-primary mb-2" />
                            <CardTitle className="text-lg group-hover:text-primary">Moje tickety</CardTitle>
                            <CardDescription>Sprawdź status zgłoszeń i odpowiedz opiekunowi.</CardDescription>
                        </CardHeader>
                    </Card>
                </Link>
            </div>
        </div>
    )
}
