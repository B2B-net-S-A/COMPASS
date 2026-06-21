'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from '@/components/blocks/AuthShell'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react'
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
            <AuthShell heading="Sprawdź email" subtitle={`Wysłaliśmy link do resetowania hasła na adres ${email}.`}>
                <div className="flex flex-col items-center gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <MailCheck className="h-6 w-6" />
                    </span>
                    <Button asChild variant="outline" className="w-full">
                        <Link href="/login">Powrót do logowania</Link>
                    </Button>
                </div>
            </AuthShell>
        )
    }

    return (
        <AuthShell heading="Reset hasła" subtitle="Wpisz email powiązany z Twoim kontem.">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="name@b2bnetwork.pl"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
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
        </AuthShell>
    )
}
