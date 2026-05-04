'use client'

import { useEffect } from 'react'
import { markPostRead } from '@/lib/actions/news'

export function MarkReadOnView({ postId, alreadyRead }: { postId: string; alreadyRead: boolean }) {
    useEffect(() => {
        if (!alreadyRead) {
            markPostRead(postId).catch(() => {})
        }
    }, [postId, alreadyRead])

    return null
}
