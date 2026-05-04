'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { setOnboardingTourDone } from '@/lib/actions/onboarding'

// react-joyride is browser-only; load on client
const Joyride = dynamic(() => import('react-joyride').then((m) => m.default), { ssr: false })

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
            disableBeacon: true,
        },
        {
            target: '[data-testid="nav-learning"]',
            content: 'Learning Center — kursy firmowe i konsultanckie. Tworzysz kurs → zarabiasz punkty za każdego studenta.',
        },
        {
            target: '[data-testid="nav-league"]',
            content: 'Dynaminds League — 7 poziomów (Scout → Legend). Punkty za rozwój, polecenia, ukończone kursy.',
        },
        {
            target: '[data-testid="nav-news"]',
            content: 'Aktualności — komunikaty od Dynaminds, badge "Nowy" przy nieprzeczytanych.',
        },
        {
            target: '[data-testid="nav-support"]',
            content: 'Support — tickety, baza wiedzy procedur (HR/Benefity/IT/Onboarding), AI Assistant 24/7.',
        },
        {
            target: '[data-testid="nav-incubator"]',
            content: 'Inkubator — zgłoś własny pomysł (do 500k inwestycji) lub dołącz do projektu wewnętrznego Dynaminds.',
        },
    ]

    return (
        <Joyride
            steps={steps}
            run={run}
            continuous
            showProgress
            showSkipButton
            disableOverlayClose
            locale={{
                back: 'Wstecz',
                close: 'Zamknij',
                last: 'Skończ',
                next: 'Dalej',
                skip: 'Pomiń',
            }}
            styles={{
                options: {
                    primaryColor: 'hsl(var(--primary))',
                    zIndex: 9999,
                    textColor: 'hsl(var(--foreground))',
                    backgroundColor: 'hsl(var(--card))',
                    arrowColor: 'hsl(var(--card))',
                },
            }}
            callback={(data) => {
                if (data.status === 'finished' || data.status === 'skipped') {
                    setRun(false)
                    setOnboardingTourDone().catch(() => {})
                }
            }}
        />
    )
}
