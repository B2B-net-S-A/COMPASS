'use client'

// Phase 39 — Bench: manually add a consultant to the bench (hybrid — for someone outside the
// auto-seed window of recent/upcoming departures).

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { addBenchEntry } from '@/lib/actions/contractors'
import {
    BENCH_STATUS_PL, BENCH_BENEFITS_PL,
    type BenchStatus, type BenchBenefits,
} from '@/lib/types/contractor'

const selectCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm'

export function BenchDialog({ onSaved }: { onSaved: () => void }) {
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [consultantName, setConsultantName] = useState('')
    const [clientName, setClientName] = useState('')
    const [role, setRole] = useState('')
    const [departureDate, setDepartureDate] = useState('')
    const [noticeDate, setNoticeDate] = useState('')
    const [status, setStatus] = useState<BenchStatus>('w_rekrutacji')
    const [benefits, setBenefits] = useState<BenchBenefits>('aktywne')

    async function save() {
        if (consultantName.trim().length < 2) { toast.error('Podaj imię i nazwisko.'); return }
        setSaving(true)
        try {
            await addBenchEntry({
                consultantName,
                clientName: clientName || null,
                role: role || null,
                departureDate: departureDate || null,
                noticeDate: noticeDate || null,
                status,
                benefits,
            })
            toast.success('Dodano na bench.')
            setOpen(false)
            setConsultantName(''); setClientName(''); setRole(''); setDepartureDate(''); setNoticeDate('')
            setStatus('w_rekrutacji'); setBenefits('aktywne')
            onSaved()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się dodać.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button onClick={() => setOpen(true)} variant="default" className="gap-2" size="sm">
                <Plus className="h-4 w-4" /> Dodaj na bench
            </Button>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Dodaj na bench</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div>
                        <Label htmlFor="b-name">Imię i nazwisko</Label>
                        <Input id="b-name" value={consultantName} onChange={(e) => setConsultantName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="b-client">Klient</Label>
                            <Input id="b-client" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                        </div>
                        <div>
                            <Label htmlFor="b-role">Rola</Label>
                            <Input id="b-role" value={role} onChange={(e) => setRole(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="b-dep">Data zejścia</Label>
                            <Input id="b-dep" type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
                        </div>
                        <div>
                            <Label htmlFor="b-notice">Data wypowiedzenia</Label>
                            <Input id="b-notice" type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Status</Label>
                            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as BenchStatus)}>
                                {Object.entries(BENCH_STATUS_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Benefity</Label>
                            <select className={selectCls} value={benefits} onChange={(e) => setBenefits(e.target.value as BenchBenefits)}>
                                {Object.entries(BENCH_BENEFITS_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Anuluj</Button>
                    <Button onClick={save} disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Dodaj
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
