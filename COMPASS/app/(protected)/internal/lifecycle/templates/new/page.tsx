import Link from 'next/link'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { NewTemplateForm } from '../../components/NewTemplateForm'
import { FilePlus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function NewTemplatePage() {
    await requireLifecycleManagerAction()

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-3xl">
            <header>
                <Link href="/internal/lifecycle/templates" className="text-xs text-muted-foreground underline">
                    ← Wszystkie szablony
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
                    <FilePlus className="h-7 w-7 text-info" />
                    Nowy szablon onboardingu
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Wybierz rolę docelową i nazwę. Items dodasz po utworzeniu w edytorze.
                </p>
            </header>

            <NewTemplateForm />
        </div>
    )
}
