'use client'

import { useCallback, useRef, useState } from 'react'

/** Keep forms locked throughout an asynchronous server action in React 18. */
export function useAcademyAction(onPendingChange?: (pending: boolean) => void) {
    const [isPending, setPending] = useState(false)
    const running = useRef(false)
    const run = useCallback(async (action: () => Promise<void>) => {
        if (running.current) return
        running.current = true
        setPending(true)
        onPendingChange?.(true)
        try {
            await action()
        } finally {
            running.current = false
            setPending(false)
            onPendingChange?.(false)
        }
    }, [onPendingChange])
    return [isPending, run] as const
}
