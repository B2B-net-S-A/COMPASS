'use client'

// Phase 17b R1 — "Are you still there?" toast that appears at 50 min idle,
// 10 min before the 60 min server-side auto-close. User clicks "Tak, pracuję"
// to reset the idle timer; ignoring it means the session will be auto-closed.

import { useEffect, useRef } from 'react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'

interface Props {
    show: boolean
    onConfirm: () => void
}

const TOAST_ID = 'work-clock-idle-warning'

export function IdleWarningToast({ show, onConfirm }: Props) {
    const shownRef = useRef(false)

    useEffect(() => {
        if (show && !shownRef.current) {
            shownRef.current = true
            toast.warning('Czy wciąż pracujesz?', {
                id: TOAST_ID,
                description:
                    'Sesja zostanie automatycznie zamknięta za ~10 min ze względu na bezczynność. Kliknij aby kontynuować.',
                duration: 10 * 60 * 1000, // pokaż przez całe okno 10 min do auto-close
                action: (
                    <Button
                        size="sm"
                        onClick={() => {
                            onConfirm()
                            toast.dismiss(TOAST_ID)
                            shownRef.current = false
                        }}
                    >
                        Tak, pracuję
                    </Button>
                ),
            })
        } else if (!show && shownRef.current) {
            // Warning condition cleared (user moved mouse, paused, or session ended)
            toast.dismiss(TOAST_ID)
            shownRef.current = false
        }
    }, [show, onConfirm])

    return null
}
