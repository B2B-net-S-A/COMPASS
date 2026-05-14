'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { changeApplicationStatus } from '@/lib/actions/incubator'
import type { ApplicationStatus } from '@/lib/types/incubator'
import { APPLICATION_STATUS_LABEL } from '@/lib/types/incubator'

const STATUSES: ApplicationStatus[] = ['submitted', 'shortlisted', 'accepted', 'rejected']

export function ApplicationStatusButtons({ applicationId, currentStatus }: { applicationId: string; currentStatus: ApplicationStatus }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handle = (status: ApplicationStatus) => {
        startTransition(async () => {
            const res = await changeApplicationStatus(applicationId, status)
            if (res.success) router.refresh()
        })
    }

    return (
        <div className="flex flex-wrap gap-1">
            {STATUSES.filter((s) => s !== currentStatus).map((s) => (
                <Button
                    key={s}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handle(s)}
                    className="text-xs h-7"
                >
                    {isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                    → {APPLICATION_STATUS_LABEL[s]}
                </Button>
            ))}
        </div>
    )
}
