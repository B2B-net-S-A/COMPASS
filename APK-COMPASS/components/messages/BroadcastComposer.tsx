'use client'

import { useState, useTransition } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Megaphone, Send, Loader2, Mail, AlertCircle } from 'lucide-react'
import { sendBroadcastToAll } from '@/lib/actions/communicator'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'

interface BroadcastComposerProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: () => void
}

export function BroadcastComposer({ isOpen, onOpenChange, onSuccess }: BroadcastComposerProps) {
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [sendEmail, setSendEmail] = useState(false)
    const [isPending, startTransition] = useTransition()

    const handleSubmit = () => {
        if (!title.trim() || !content.trim()) {
            toast.error('Podaj tytuł i treść ogłoszenia')
            return
        }

        startTransition(async () => {
            try {
                const result = await sendBroadcastToAll(title.trim(), content.trim(), sendEmail)
                if (result.error) {
                    toast.error(result.error)
                    return
                }
                toastSuccess(
                    sendEmail
                        ? `Ogłoszenie wysłane do ${result.recipientCount} osób (+ email)`
                        : `Ogłoszenie wysłane do ${result.recipientCount} osób`
                )
                setTitle('')
                setContent('')
                setSendEmail(false)
                onOpenChange(false)
                onSuccess?.()
            } catch (err: any) {
                toast.error(err.message || 'Błąd wysyłania ogłoszenia')
            }
        })
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg bg-zinc-950 border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-amber-400" />
                        Nowe ogłoszenie
                    </DialogTitle>
                    <DialogDescription className="text-slate-600">
                        Wyślij wiadomość do wszystkich użytkowników systemu ComPass.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Tytuł ogłoszenia</Label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="np. Zmiana regulaminu, Nowy projekt, Informacja..."
                            className="bg-white/5 border-white/10"
                            maxLength={120}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Treść wiadomości</Label>
                        <Textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Napisz treść ogłoszenia..."
                            className="bg-white/5 border-white/10 min-h-[120px]"
                            maxLength={2000}
                        />
                        <p className="text-[10px] text-slate-600 text-right">{content.length}/2000</p>
                    </div>

                    <div className="flex items-start space-x-3 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <Checkbox
                            id="send_email"
                            checked={sendEmail}
                            onCheckedChange={(val) => setSendEmail(val === true)}
                        />
                        <div className="grid gap-1 leading-none">
                            <label htmlFor="send_email" className="text-sm font-medium text-slate-300 cursor-pointer flex items-center gap-2">
                                <Mail className="w-4 h-4 text-amber-400" />
                                Wyślij również email do wszystkich użytkowników
                            </label>
                            <p className="text-[10px] text-slate-600">
                                Każdy użytkownik otrzyma kopię ogłoszenia na swój adres email.
                            </p>
                        </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white/5 border border-white/5 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-slate-600 leading-relaxed">
                            Ogłoszenie będzie widoczne dla wszystkich zarejestrowanych użytkowników w zakładce Wiadomości.
                            Użytkownicy nie mogą odpowiadać na ogłoszenia.
                        </p>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isPending}
                        className="border-white/10"
                    >
                        Anuluj
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending || !title.trim() || !content.trim()}
                        className="bg-amber-600 hover:bg-amber-500 gap-2"
                    >
                        {isPending ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Wysyłanie...</>
                        ) : (
                            <><Send className="w-4 h-4" /> Wyślij ogłoszenie</>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
