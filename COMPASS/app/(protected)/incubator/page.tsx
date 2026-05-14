import Link from 'next/link'
import { Lightbulb, Plus, Briefcase, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default function IncubatorLandingPage() {
    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div>
                <div className="flex items-center gap-3">
                    <Lightbulb className="w-8 h-8 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Inkubator B2Bnetwork</h1>
                </div>
                <p className="text-muted-foreground mt-1 max-w-2xl">
                    Twoje pomysły i nasze produkty wewnętrzne. Zgłoś własne rozwiązanie lub dołącz do projektu B2Bnetwork.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-gradient-to-br from-primary/10 to-card border-primary/30 h-full">
                    <CardHeader>
                        <Plus className="w-8 h-8 text-primary mb-2" />
                        <CardTitle className="text-xl">Mam pomysł</CardTitle>
                        <CardDescription>
                            Zgłoś swoje rozwiązanie. Możliwa inwestycja do 500 000 PLN i partnerska umowa dystrybucji.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• Twoja IP zostaje Twoja</li>
                            <li>• Akceptacja oświadczenia poufności przed zgłoszeniem</li>
                            <li>• Status: Złożone → Analiza → Negocjacje → Zaakceptowane</li>
                        </ul>
                        <div className="flex gap-2">
                            <Link href="/incubator/submit-idea" className="flex-1">
                                <Button className="w-full gap-2">
                                    Zgłoś pomysł <ArrowRight className="w-4 h-4" />
                                </Button>
                            </Link>
                            <Link href="/incubator/my-pitches">
                                <Button variant="outline">Moje pitche</Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10 h-full">
                    <CardHeader>
                        <Briefcase className="w-8 h-8 text-primary mb-2" />
                        <CardTitle className="text-xl">Pracuj nad naszym produktem</CardTitle>
                        <CardDescription>
                            Wewnętrzne projekty B2Bnetwork otwarte na zaangażowanie konsultantów. Equity, royalty lub stała stawka.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/incubator/projects">
                            <Button className="w-full gap-2" variant="outline">
                                Zobacz projekty <ArrowRight className="w-4 h-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
