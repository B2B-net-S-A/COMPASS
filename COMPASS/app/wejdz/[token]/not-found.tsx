import Link from 'next/link'

export default function LearnerPassNotFound() {
    return (
        <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10">
            <section className="w-full space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
                <h1 className="text-xl font-bold">Ten link jest nieważny albo wygasł</h1>
                <p className="text-sm text-muted-foreground">Sprawdź, czy otwierasz najnowszy link, albo poproś o nowy.</p>
                <Link href="/wejdz" className="text-sm font-medium text-primary underline underline-offset-2">Poproś o nowy link</Link>
            </section>
        </main>
    )
}
