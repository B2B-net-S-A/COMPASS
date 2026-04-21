'use client'

import { useEffect } from 'react'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('Admin Route Error:', error)
    }, [error])

    return (
        <div className="p-10 text-white bg-red-900/50 border border-red-500 rounded-lg m-4">
            <h2 className="text-2xl font-bold mb-4">Coś poszło nie tak w panelu administracji!</h2>
            <div className="bg-black/50 p-4 rounded mb-4 font-mono text-sm break-all">
                {error.message}
            </div>
            <button
                onClick={() => reset()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white"
            >
                Spróbuj ponownie
            </button>
        </div>
    )
}
