import Link from 'next/link'
import { Lightbulb } from 'lucide-react'
import { PitchForm } from '@/components/incubator/PitchForm'

export const dynamic = 'force-dynamic'

export default function SubmitIdeaPage() {
    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/incubator" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Inkubator
                </Link>
                <div className="flex items-center gap-3">
                    <Lightbulb className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Zgłoś pomysł</h1>
                </div>
                <p className="text-muted-foreground mt-1">Po akceptacji oświadczenia poufności możesz opisać pomysł.</p>
            </div>

            <PitchForm />
        </div>
    )
}
