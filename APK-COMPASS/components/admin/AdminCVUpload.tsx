'use client'

import { useState, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, RefreshCw } from "lucide-react"
import { useConfirm } from '@/components/shared/ConfirmDialog'

interface AdminCVUploadProps {
    candidateId: string
}

export function AdminCVUpload({ candidateId }: AdminCVUploadProps) {
    const [loading, setLoading] = useState(false)
    const [confirm, ConfirmUI] = useConfirm()
    const inputRef = useRef<HTMLInputElement>(null)

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const ok = await confirm({
            title: 'Aktualizacja CV',
            description: 'Czy na pewno chcesz zaktualizować CV? To nadpisze obecny plik i wygeneruje nowy profil AI.',
            confirmLabel: 'Aktualizuj',
        })
        if (!ok) {
            if (inputRef.current) inputRef.current.value = ''
            return
        }

        setLoading(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const { adminUploadCV } = await import('@/lib/actions/files')
            const result = await adminUploadCV(formData, candidateId)

            if (result.success) {
                alert('CV zostało zaktualizowane pomyślnie!')
                window.location.reload() // Reload to show new data
            } else {
                alert('Błąd: ' + result.error)
            }
        } catch (err: any) {
            console.error(err)
            alert('Wystąpił błąd podczas wgrywania pliku: ' + err.message)
        } finally {
            setLoading(false)
            if (inputRef.current) inputRef.current.value = ''
        }
    }

    return (
        <div className="flex items-center gap-4 p-4 border border-dashed border-white/20 rounded-lg bg-white/5">
            <ConfirmUI />
            <div className="flex-1">
                <h4 className="text-sm font-medium text-white mb-1">Aktualizuj CV</h4>
                <p className="text-xs text-muted-foreground">
                    Wgranie nowego pliku automatycznie nadpisze stare dane i uruchomi ponowną analizę AI.
                </p>
            </div>
            <div className="relative">
                <Input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    id="admin-cv-upload"
                    onChange={handleUpload}
                    disabled={loading}
                />
                <Button asChild variant="secondary" className="cursor-pointer" disabled={loading}>
                    <label htmlFor="admin-cv-upload">
                        {loading ? (
                            <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Przetwarzanie...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4 mr-2" />
                                Wgraj nowe CV
                            </>
                        )}
                    </label>
                </Button>
            </div>
        </div>
    )
}
