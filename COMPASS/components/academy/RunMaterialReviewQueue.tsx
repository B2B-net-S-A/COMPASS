import Link from 'next/link'
import { listAcademyRunMaterialReviews } from '@/lib/actions/academy-materials'

export async function RunMaterialReviewQueue() {
    const result = await listAcademyRunMaterialReviews()
    return <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Materiały edycji do akceptacji</h2>
        <p className="text-sm text-muted-foreground">Pliki po weryfikacji bezpieczeństwa, oczekujące na decyzję o udostępnieniu grupie.</p>
        {!result.success ? <p role="alert" className="text-sm text-destructive">{result.error}</p> : result.data.length === 0 ? <p className="text-sm text-muted-foreground">Brak materiałów oczekujących na akceptację.</p> : <ul className="divide-y divide-border">{result.data.map(item => <li key={item.id} className="py-3"><Link href={'/learning/edycje/' + item.run_id} className="break-words font-medium text-primary underline-offset-4 hover:underline">{item.filename}</Link><p className="text-xs text-muted-foreground">Otwórz edycję, aby obejrzeć plik i zapisać decyzję.</p></li>)}</ul>}
    </section>
}
