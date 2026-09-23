import Link from 'next/link'
import { listAcademyRunMaterialReviews } from '@/lib/actions/academy-materials'

export async function RunMaterialReviewQueue({ page = 1, coursePage = 1 }: { page?: number; coursePage?: number }) {
    const result = await listAcademyRunMaterialReviews(page)
    const pageHref = (target: number) => {
        const params = new URLSearchParams()
        if (coursePage > 1) params.set('page', String(coursePage))
        if (target > 1) params.set('materialPage', String(target))
        const query = params.toString()
        return `/admin/learning${query ? `?${query}` : ''}`
    }
    return <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Materiały edycji do akceptacji</h2>
        <p className="text-sm text-muted-foreground">Pliki po weryfikacji bezpieczeństwa, oczekujące na decyzję o udostępnieniu grupie.</p>
        {!result.success ? <p role="alert" className="text-sm text-destructive">{result.error}</p> : result.data.total === 0 ? <p className="text-sm text-muted-foreground">Brak materiałów oczekujących na akceptację.</p> : <>
            <p className="text-sm text-muted-foreground">Materiały oczekujące na decyzję: <strong className="text-foreground">{result.data.total}</strong></p>
            {result.data.items.length === 0 ? <p className="text-sm text-muted-foreground">Brak materiałów na tej stronie. Wróć do wcześniejszej strony kolejki.</p> : <ul className="divide-y divide-border">{result.data.items.map(item => <li key={item.id} className="py-3"><Link href={'/learning/edycje/' + item.run_id} className="break-words font-medium text-primary underline-offset-4 hover:underline">{item.filename}</Link><p className="text-xs text-muted-foreground">Otwórz edycję, aby obejrzeć plik i zapisać decyzję.</p></li>)}</ul>}
            <nav aria-label="Strony materiałów edycji do akceptacji" className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>{page > 1 ? <Link className="text-primary hover:underline" href={pageHref(page - 1)}>← Poprzednia strona</Link> : null}</span>
                <span className="text-muted-foreground">Strona {page} z {Math.max(1, Math.ceil(result.data.total / result.data.pageSize))}</span>
                <span>{page * result.data.pageSize < result.data.total ? <Link className="text-primary hover:underline" href={pageHref(page + 1)}>Następna strona →</Link> : null}</span>
            </nav>
        </>}
    </section>
}
