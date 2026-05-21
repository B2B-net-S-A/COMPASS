'use client'

// Phase 27i — "Zarządzaj umową" dialog: contract type (UoP/Zlecenie/B2B) + contract
// documents (umowa + aneksy). Separate from the rate dialog. Finanse + admin only.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { setUserContractType } from '@/lib/actions/internal-rates'
import type { EmploymentType, UserRateDirectoryRow } from '@/lib/types/rates'
import { EMPLOYMENT_TYPE_LABELS_PL } from '@/lib/types/rates'
import { ContractDocumentsSection } from './ContractDocumentsSection'

interface Props {
    target: UserRateDirectoryRow
    onOpenChange: (open: boolean) => void
}

export function ManageContractDialog({ target, onOpenChange }: Props) {
    const router = useRouter()
    const name = target.full_name ?? target.email
    const [contractType, setContractType] = useState<EmploymentType>(target.employment_type ?? 'b2b')
    const [savingType, setSavingType] = useState(false)

    async function handleSaveContractType() {
        setSavingType(true)
        try {
            await setUserContractType(target.user_id, contractType)
            toast.success(`Typ umowy: ${EMPLOYMENT_TYPE_LABELS_PL[contractType]}.`)
            router.refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Błąd zmiany typu umowy.')
        } finally {
            setSavingType(false)
        }
    }

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Zarządzaj umową — {name}</DialogTitle>
                    <DialogDescription className="text-xs">{target.email}</DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* ─── Typ umowy ───────────────────────────────────────── */}
                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold">Typ umowy</h3>
                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <Label htmlFor="contract-type" className="sr-only">
                                    Typ umowy
                                </Label>
                                <select
                                    id="contract-type"
                                    value={contractType}
                                    onChange={(e) => setContractType(e.target.value as EmploymentType)}
                                    disabled={savingType}
                                    className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
                                >
                                    <option value="uop">{EMPLOYMENT_TYPE_LABELS_PL.uop} (umowa o pracę)</option>
                                    <option value="zlecenie">{EMPLOYMENT_TYPE_LABELS_PL.zlecenie} (umowa zlecenie)</option>
                                    <option value="b2b">{EMPLOYMENT_TYPE_LABELS_PL.b2b} (faktura)</option>
                                </select>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleSaveContractType}
                                disabled={savingType || contractType === (target.employment_type ?? 'b2b')}
                            >
                                {savingType && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Zapisz typ
                            </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            UoP i Zlecenie rozliczają się przez payroll (godziny × stawka). B2B rozlicza się fakturami.
                        </p>
                    </section>

                    <div className="border-t border-border/40" />

                    {/* ─── Umowy i załączniki ──────────────────────────────── */}
                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold">Umowy i załączniki</h3>
                        <p className="text-[11px] text-muted-foreground">
                            Wiele plików per pracownik (umowa, aneksy) — każdy z opisem i datą podpisania.
                        </p>
                        <ContractDocumentsSection userId={target.user_id} />
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    )
}
