import Link from 'next/link'
import { Briefcase } from 'lucide-react'
import { NewProjectClient } from './NewProjectClient'

export const dynamic = 'force-dynamic'

export default function NewProjectPage() {
    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/admin/incubator/projects" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Manager projektów
                </Link>
                <div className="flex items-center gap-3">
                    <Briefcase className="w-7 h-7 text-primary" />
                    <h1 className="text-3xl font-bold tracking-tight">Nowy projekt wewnętrzny</h1>
                </div>
            </div>

            <NewProjectClient />
        </div>
    )
}
