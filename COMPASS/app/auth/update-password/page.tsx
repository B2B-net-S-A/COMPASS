'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
    PASSWORD_MIN_LENGTH,
    PASSWORD_POLICY_ERROR_PL,
    PASSWORD_POLICY_HINT_PL,
    isPasswordStrongEnough,
} from '@/lib/auth/password-policy'

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Audyt 2026-08: ta ścieżka nie sprawdzała NICZEGO poza `minLength={6}`,
        // więc reset hasła wpuszczał hasła słabsze niż rejestracja (min. 10 + wielka
        // litera + cyfra). Supabase pilnuje tylko długości ustawionej w projekcie —
        // złożoność musi wymusić aplikacja.
        if (!isPasswordStrongEnough(password)) {
            toast.error(PASSWORD_POLICY_ERROR_PL)
            return
        }

        setLoading(true)

        const supabase = createClient()
        const { error } = await supabase.auth.updateUser({ password })

        setLoading(false)

        if (error) {
            toast.error(error.message)
        } else {
            toastSuccess('Hasło zostało zmienione')
            router.push('/home')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md border-border bg-card backdrop-blur-xl">
                <CardHeader>
                    <CardTitle>Nowe hasło</CardTitle>
                    <CardDescription>Wprowadź nowe hasło do swojego konta.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="new-password">Nowe hasło</Label>
                            <Input
                                id="new-password"
                                name="new-password"
                                type="password"
                                autoComplete="new-password"
                                placeholder={PASSWORD_POLICY_HINT_PL}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={PASSWORD_MIN_LENGTH}
                                required
                                className="bg-card border-border"
                            />
                            <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_HINT_PL}</p>
                        </div>
                        <Button type="submit" disabled={loading} className="w-full">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Zmień hasło
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
