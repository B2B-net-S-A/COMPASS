import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-2 text-center">
                <div className="rounded-full bg-muted p-4">
                    <FileQuestion className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Nie znaleziono strony</h2>
                <p className="text-muted-foreground">
                    Strona, której szukasz, nie istnieje lub została przeniesiona.
                </p>
            </div>
            <Button asChild>
                <Link href="/home">Wróć do pulpitu</Link>
            </Button>
        </div>
    )
}
