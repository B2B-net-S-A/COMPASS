'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createProject } from '@/lib/actions/incubator'

export function NewProjectClient() {
    const router = useRouter()
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [techStack, setTechStack] = useState('')
    const [compensation, setCompensation] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const canSubmit = !isPending && title.trim().length >= 3 && description.trim().length >= 20

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
            const tech = techStack.split(',').map((s) => s.trim()).filter(Boolean)
            const res = await createProject({
                title,
                description_md: description,
                tech_stack: tech,
                compensation_model: compensation || undefined,
            })
            if (!res.success) { setError(res.error); return }
            router.push(`/admin/incubator/projects/${res.data.slug}`)
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-4">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Tytuł projektu *</label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isPending} required minLength={3} />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Opis (markdown) *</label>
                        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={10} disabled={isPending} required minLength={20} />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Tech stack (oddziel przecinkami)</label>
                        <Input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="React, TypeScript, Postgres, Stripe" disabled={isPending} />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Forma rozliczenia</label>
                        <Input value={compensation} onChange={(e) => setCompensation(e.target.value)} placeholder="np. 200 PLN/h, 5% equity, royalty 10%" disabled={isPending} />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button type="submit" disabled={!canSubmit} className="gap-2">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Stwórz projekt
                </Button>
            </div>
        </form>
    )
}
