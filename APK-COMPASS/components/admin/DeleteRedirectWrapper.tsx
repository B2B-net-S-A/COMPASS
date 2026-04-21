'use client'

import { useRouter } from 'next/navigation'
import { DeleteCandidateButton } from './DeleteCandidateButton'

interface DeleteRedirectWrapperProps {
    id: string
    name?: string
}

export function DeleteRedirectWrapper({ id, name }: DeleteRedirectWrapperProps) {
    const router = useRouter()

    return (
        <DeleteCandidateButton
            id={id}
            name={name}
            variant="full"
            onDeleted={() => {
                router.push('/admin/candidates')
            }}
        />
    )
}
