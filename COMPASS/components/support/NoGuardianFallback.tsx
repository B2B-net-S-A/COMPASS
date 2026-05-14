import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, AlertCircle, Plus } from 'lucide-react'

export function NoGuardianFallback() {
    return (
        <Card className="bg-amber-500/5 border-amber-500/20">
            <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-medium mb-1">Nie masz jeszcze przypisanego opiekuna</h3>
                        <p className="text-sm text-muted-foreground">
                            Skontaktuj się z administracją, żeby ustawić rekrutera lub delivery leada
                            do bezpośredniej rozmowy. W międzyczasie możesz utworzyć ticket — zostanie
                            przekazany do dyżurnego opiekuna.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                    <Button asChild variant="outline" size="sm" className="gap-2">
                        <a href="mailto:administracja@b2bnetwork.pl">
                            <Mail className="w-4 h-4" />
                            administracja@b2bnetwork.pl
                        </a>
                    </Button>
                    <Button asChild size="sm" className="gap-2">
                        <Link href="/support/tickets/new">
                            <Plus className="w-4 h-4" />
                            Utwórz ticket
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
