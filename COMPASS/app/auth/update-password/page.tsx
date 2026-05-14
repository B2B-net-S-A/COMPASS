'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function UpdatePasswordPage() {
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
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
            <Card className="w-full max-w-md border-white/10 bg-black/50 backdrop-blur-xl">
                <CardHeader>
                    <CardTitle>Nowe hasło</CardTitle>
                    <CardDescription>Wprowadź nowe hasło do swojego konta.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Input
                                type="password"
                                placeholder="Min. 6 znaków"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={6}
                                required
                                className="bg-white/5 border-white/10"
                            />
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
