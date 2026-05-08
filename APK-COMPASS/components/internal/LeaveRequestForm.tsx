'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { createLeaveRequest, type LeaveType } from '@/lib/actions/internal-leave'

const LEAVE_TYPES: ReadonlyArray<{ value: LeaveType; label: string; needsDocs?: boolean }> = [
    { value: 'vacation', label: 'Urlop wypoczynkowy' },
    { value: 'sick_leave', label: 'L4 / chorobowe (auto-akceptacja)', needsDocs: true },
    { value: 'parental_leave', label: 'Opieka rodzicielska' },
    { value: 'unpaid_leave', label: 'Urlop bezpłatny' },
    { value: 'training', label: 'Szkolenie / konferencja' },
    { value: 'other', label: 'Inne' },
]

export function LeaveRequestForm() {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [leaveType, setLeaveType] = useState<LeaveType>('vacation')
    const [startDate, setStartDate] = useState<string>('')
    const [endDate, setEndDate] = useState<string>('')
    const [halfDay, setHalfDay] = useState<'' | 'morning' | 'afternoon'>('')
    const [note, setNote] = useState<string>('')
    const [docUrl, setDocUrl] = useState<string>('')

    const showHalfDay = startDate && endDate && startDate === endDate
    const showDocsField = leaveType === 'sick_leave'

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!startDate || !endDate) {
            toast.error('Podaj zakres dat.')
            return
        }
        if (endDate < startDate) {
            toast.error('Data końca nie może być wcześniejsza niż początek.')
            return
        }

        startTransition(async () => {
            try {
                const res = await createLeaveRequest({
                    startDate,
                    endDate,
                    leaveType,
                    halfDay: showHalfDay && halfDay ? halfDay : null,
                    note: note || null,
                    documentationUrl: docUrl || null,
                })
                toastSuccess(
                    res.autoApproved
                        ? 'Wniosek L4 zaakceptowany automatycznie. Pamiętaj o dosłaniu zwolnienia w ciągu 7 dni.'
                        : 'Wniosek złożony. Czeka na akceptację admina.',
                )
                setStartDate('')
                setEndDate('')
                setNote('')
                setDocUrl('')
                setHalfDay('')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nieznany błąd')
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Nowy wniosek</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="leave_type">Typ wniosku</Label>
                        <select
                            id="leave_type"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={leaveType}
                            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                        >
                            {LEAVE_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="start_date">Od</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="end_date">Do</Label>
                            <Input
                                id="end_date"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {showHalfDay && (
                        <div className="space-y-1.5">
                            <Label htmlFor="half_day">Połowa dnia (opcjonalnie)</Label>
                            <select
                                id="half_day"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                                value={halfDay}
                                onChange={(e) => setHalfDay(e.target.value as '' | 'morning' | 'afternoon')}
                            >
                                <option value="">Cały dzień</option>
                                <option value="morning">Pierwsza połowa</option>
                                <option value="afternoon">Druga połowa</option>
                            </select>
                        </div>
                    )}

                    {showDocsField && (
                        <div className="space-y-1.5">
                            <Label htmlFor="doc_url">Link do skanu zwolnienia (opcjonalnie)</Label>
                            <Input
                                id="doc_url"
                                type="url"
                                placeholder="https://drive.google.com/…"
                                value={docUrl}
                                onChange={(e) => setDocUrl(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="note">Notatka (opcjonalna)</Label>
                        <Textarea
                            id="note"
                            rows={3}
                            maxLength={500}
                            placeholder="Powód lub dodatkowe informacje…"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>

                    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
                        {pending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Złóż wniosek
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
