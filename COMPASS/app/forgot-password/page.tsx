'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const supabase = createClient()
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
        })

        setLoading(false)

        if (error) {
            toast.error(error.message)
        } else {
            setSubmitted(true)
            toastSuccess('Sprawdź skrzynkę email')
        }
    }

    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="w-full max-w-md border-white/10 bg-black/50 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle>Sprawdź email</CardTitle>
                        <CardDescription>
                            Wysłaliśmy link do resetowania hasła na adres {email}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild variant="outline" className="w-full">
                            <Link href="/login">Powrót do logowania</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md border-white/10 bg-black/50 backdrop-blur-xl">
                <CardHeader>
                    <CardTitle>Reset hasła</CardTitle>
                    <CardDescription>Wpisz email powiązany z Twoim kontem.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Button type="submit" disabled={loading} className="w-full">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Wyślij link
                            </Button>
                            <Button asChild variant="ghost" className="w-full">
                                <Link href="/login">
                                    <ArrowLeft className="mr-2 h-4 w-4" /> Powrót
                                </Link>
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
