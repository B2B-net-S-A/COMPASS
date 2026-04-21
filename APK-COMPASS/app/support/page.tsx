import Link from 'next/link'

export const metadata = { title: 'Wsparcie | ComPass' }

export default function SupportPage() {
    return (
        <div className="min-h-screen bg-background p-8 text-foreground max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Wsparcie / Support</h1>
            <p className="text-muted-foreground mb-6">
                W sprawach technicznych i pytań dotyczących platformy ComPass skontaktuj się z nami:{' '}
                <a href="mailto:administracja@b2bnetwork.pl" className="text-primary hover:underline">administracja@b2bnetwork.pl</a>
            </p>
            <Link href="/login" className="text-primary hover:underline">← Powrót do logowania</Link>
        </div>
    )
}
