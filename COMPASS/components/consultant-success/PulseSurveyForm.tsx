'use client'

import { useState, type FormEvent } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
    token: string
}

const RANGE_0_10 = Array.from({ length: 11 }, (_, value) => value)
const RANGE_1_5 = Array.from({ length: 5 }, (_, index) => index + 1)

export function PulseSurveyForm({ token }: Props) {
    const [pending, setPending] = useState(false)
    const [completed, setCompleted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setPending(true)
        setError(null)

        const form = new FormData(event.currentTarget)
        const response = await fetch(`/api/public/consultant-pulse/${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                satisfactionScore: Number(form.get('satisfactionScore')),
                engagementScore: Number(form.get('engagementScore')),
                recommendationScore: Number(form.get('recommendationScore')),
                note: String(form.get('note') ?? '').trim() || null,
            }),
        }).catch(() => null)

        if (!response) {
            setError('Nie udało się połączyć z Compass. Spróbuj ponownie.')
            setPending(false)
            return
        }

        const body = await response.json().catch(() => ({})) as { message?: string }
        if (!response.ok) {
            setError(body.message ?? 'Nie udało się zapisać odpowiedzi.')
            setPending(false)
            return
        }

        setCompleted(true)
        setPending(false)
    }

    if (completed) {
        return (
            <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden="true" />
                <h2 className="text-xl font-semibold">Dziękujemy za odpowiedź</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                    Ankieta została zapisana. Link nie może zostać użyty ponownie.
                </p>
            </div>
        )
    }

    return (
        <form className="space-y-7" onSubmit={onSubmit}>
            <ScoreField
                id="satisfactionScore"
                label="Jak oceniasz swoją ogólną satysfakcję ze współpracy?"
                values={RANGE_0_10}
                lowLabel="Bardzo nisko"
                highLabel="Bardzo wysoko"
                defaultValue={5}
            />
            <ScoreField
                id="engagementScore"
                label="Jak oceniasz swoje obecne zaangażowanie?"
                values={RANGE_1_5}
                lowLabel="Bardzo niskie"
                highLabel="Bardzo wysokie"
                defaultValue={3}
            />
            <ScoreField
                id="recommendationScore"
                label="Na ile prawdopodobne jest, że polecisz współpracę z nami?"
                values={RANGE_0_10}
                lowLabel="Zdecydowanie nie"
                highLabel="Zdecydowanie tak"
                defaultValue={5}
            />

            <div className="space-y-2">
                <Label htmlFor="note">Dodatkowy komentarz (opcjonalnie)</Label>
                <Textarea id="note" name="note" maxLength={2000} rows={5} />
            </div>

            {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                    {error}
                </p>
            )}

            <Button className="w-full" type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Wyślij odpowiedź
            </Button>
        </form>
    )
}

function ScoreField({
    id,
    label,
    values,
    lowLabel,
    highLabel,
    defaultValue,
}: {
    id: string
    label: string
    values: number[]
    lowLabel: string
    highLabel: string
    defaultValue: number
}) {
    return (
        <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{label}</legend>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
                {values.map((value) => (
                    <label key={value} className="cursor-pointer">
                        <input
                            className="peer sr-only"
                            type="radio"
                            name={id}
                            value={value}
                            defaultChecked={value === defaultValue}
                            required
                        />
                        <span className="flex h-10 items-center justify-center rounded-md border bg-background text-sm transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                            {value}
                        </span>
                    </label>
                ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
                <span>{lowLabel}</span>
                <span>{highLabel}</span>
            </div>
        </fieldset>
    )
}
