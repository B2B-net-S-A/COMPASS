import Link from 'next/link'
import { Users, ArrowLeft, DollarSign } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GuardianCard } from '@/components/support/GuardianCard'
import { NoGuardianFallback } from '@/components/support/NoGuardianFallback'
import { getMyGuardians } from '@/lib/actions/centrala-management'

export const dynamic = 'force-dynamic'

export default async function SupportContactsPage() {
    const guardians = await getMyGuardians()

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
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
                            Bezpośredni czat z Rekruterem i Delivery Leadem.
                        </p>
                    </div>
                </div>
            </div>

            {guardians.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                    {guardians.map((g) => (
                        <GuardianCard key={`${g.user_id}-${g.type}`} guardian={g} />
                    ))}
                </div>
            ) : (
                <NoGuardianFallback />
            )}

            <Card className="bg-emerald-500/5 border-emerald-500/20">
                <CardContent className="p-5 flex items-start gap-3">
                    <DollarSign className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <h3 className="font-medium mb-1">Sprawa finansowa?</h3>
                        <p className="text-sm text-muted-foreground mb-3">
                            Faktury, rozliczenia, refundacje benefitów — najszybciej trafią do działu
                            finansowego przez ticket. Każdy z Centrali finansowej widzi kategorię „Finanse".
                        </p>
                        <Button asChild size="sm" variant="outline" className="gap-2">
                            <Link href="/support/tickets/new?category=finance">
                                Utwórz ticket „Finanse"
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
