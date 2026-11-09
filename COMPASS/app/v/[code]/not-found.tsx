export default function VerifyDocumentNotFound() {
    return <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10">
        <section className="w-full space-y-2 rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
            <h1 className="text-xl font-bold">Nie znaleziono dokumentu</h1>
            <p className="text-sm text-muted-foreground">Link jest nieprawidłowy albo właściciel wyłączył weryfikację.</p>
        </section>
    </main>
}
