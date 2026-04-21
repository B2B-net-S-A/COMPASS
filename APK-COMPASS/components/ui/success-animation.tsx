'use client'

import { cn } from '@/lib/utils'

/**
 * Animated Success Checkmark
 * SVG checkmark that draws itself with a smooth animation.
 * Used in toast notifications for success feedback.
 *
 * Performance: Pure CSS animation on SVG stroke — zero JS runtime.
 * Duration: ~500ms total (circle 400ms + check 300ms with 200ms delay)
 */
export function AnimatedCheckmark({
    size = 24,
    className,
    color = 'currentColor'
}: {
    size?: number
    className?: string
    color?: string
}) {
    return (
        <div className={cn('success-check-container inline-flex', className)}>
            <svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <circle
                    className="success-check-circle"
                    cx="12"
                    cy="12"
                    r="11"
                    stroke={color}
                    strokeWidth="2"
                    fill="none"
                />
                <path
                    className="success-check-mark"
                    d="M7 12.5L10.5 16L17 9"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
            </svg>
        </div>
    )
}
