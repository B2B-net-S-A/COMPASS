'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
    title: string
    description?: string
    icon?: React.ReactNode
    defaultOpen?: boolean
    sectionId: string
    children: React.ReactNode
    className?: string
}

export function CollapsibleSection({
    title,
    description,
    icon,
    defaultOpen = true,
    sectionId,
    children,
    className,
}: CollapsibleSectionProps) {
    const storageKey = `section-${sectionId}`

    const [isOpen, setIsOpen] = useState(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(storageKey)
            if (stored !== null) return stored === 'true'
        }
        return defaultOpen
    })

    useEffect(() => {
        localStorage.setItem(storageKey, String(isOpen))
    }, [isOpen, storageKey])

    return (
        <Card className={cn('overflow-hidden', className)}>
            <CardHeader
                className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {icon && <div className="text-muted-foreground">{icon}</div>}
                        <div>
                            <CardTitle className="text-lg">{title}</CardTitle>
                            {description && (
                                <CardDescription className="mt-1">{description}</CardDescription>
                            )}
                        </div>
                    </div>
                    <ChevronDown
                        className={cn(
                            'h-5 w-5 text-muted-foreground transition-transform duration-200',
                            isOpen && 'rotate-180'
                        )}
                    />
                </div>
            </CardHeader>
            <div
                className={cn(
                    'transition-all duration-300 ease-in-out',
                    isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
                )}
            >
                <CardContent className="pt-0">
                    {children}
                </CardContent>
            </div>
        </Card>
    )
}
