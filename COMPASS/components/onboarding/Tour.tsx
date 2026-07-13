'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { EventData } from 'react-joyride'
import { setOnboardingTourDone } from '@/lib/actions/onboarding'

// react-joyride is browser-only; load on client
const Joyride = dynamic(() => import('react-joyride').then((m) => m.Joyride), { ssr: false })

interface TourProps {
    initialDone: boolean
}

export function Tour({ initialDone }: TourProps) {
    const [run, setRun] = useState(false)

    useEffect(() => {
        if (!initialDone) {
            // Slight delay so the sidebar is mounted
            const t = setTimeout(() => setRun(true), 600)
            return () => clearTimeout(t)
        }
    }, [initialDone])

    if (initialDone) return null

    const steps = [
        {
            target: '[data-testid="nav-home"]',
            content: 'Pulpit — szybki widok wszystkich 5 paneli platformy.',
            skipBeacon: true,
        },
        {
            target: '[data-testid="nav-learning"]',
            content: 'Learning Center — kursy firmowe i konsultanckie. Tworzysz kurs → zarabiasz punkty za każdego studenta.',
        },
        {
            target: '[data-testid="nav-league"]',
            content: 'B2Bnetwork League — 7 poziomów (Scout → Legend). Punkty za rozwój, polecenia, ukończone kursy.',
        },
        {
            target: '[data-testid="nav-news"]',
            content: 'Aktualności — komunikaty od B2Bnetwork, badge "Nowy" przy nieprzeczytanych.',
        },
        {
            target: '[data-testid="nav-support"]',
            content: 'Support — tickety, baza wiedzy procedur (HR/Benefity/IT/Onboarding), chat z opiekunem.',
        },
        {
            target: '[data-testid="nav-incubator"]',
            content: 'Inkubator — zgłoś własny pomysł (do 500k inwestycji) lub dołącz do projektu wewnętrznego B2Bnetwork.',
        },
    ]

    return (
        <Joyride
            steps={steps}
            run={run}
            continuous
            locale={{
                back: 'Wstecz',
                close: 'Zamknij',
                last: 'Skończ',
                next: 'Dalej',
                nextWithProgress: 'Dalej ({current} z {total})',
                skip: 'Pomiń',
            }}
            options={{
                buttons: ['back', 'close', 'primary', 'skip'],
                overlayClickAction: false,
                showProgress: true,
                primaryColor: 'hsl(var(--primary))',
                zIndex: 9999,
                textColor: 'hsl(var(--foreground))',
                backgroundColor: 'hsl(var(--card))',
                arrowColor: 'hsl(var(--card))',
            }}
            onEvent={(data: EventData) => {
                if (data.status === 'finished' || data.status === 'skipped') {
                    setRun(false)
                    setOnboardingTourDone().catch(() => {})
                }
            }}
        />
    )
}
