import React from 'react'
import Link from 'next/link'
import { Hexagon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogoProps {
    className?: string
    showText?: boolean
    size?: 'sm' | 'md' | 'lg' | 'xl'
    variant?: 'default' | 'monochrome'
    href?: string
}

export function Logo({ className, showText = true, size = 'md', variant = 'default', href = '/home' }: LogoProps) {
    const sizeClasses = {
        sm: { icon: 'w-6 h-6', dot: 'w-1 h-1', text: 'text-lg', subtext: 'text-[8px]' },
        md: { icon: 'w-8 h-8', dot: 'w-1.5 h-1.5', text: 'text-xl', subtext: 'text-[10px]' },
        lg: { icon: 'w-10 h-10', dot: 'w-2 h-2', text: 'text-2xl', subtext: 'text-[12px]' },
        xl: { icon: 'w-16 h-16', dot: 'w-3 h-3', text: 'text-4xl', subtext: 'text-[14px]' },
    }

    const currentSize = sizeClasses[size]
    const isMonochrome = variant === 'monochrome'

    const content = (
        <div className={cn(
            "flex items-center gap-3 group cursor-pointer transition-opacity hover:opacity-80",
            className
        )}>
            <div className="relative">
                {!isMonochrome && (
                    <div className="absolute inset-0 bg-primary blur-xl opacity-20 transition-opacity group-hover:opacity-40"></div>
                )}
                <Hexagon
                    className={cn(
                        currentSize.icon,
                        isMonochrome ? "text-current" : "text-primary"
                    )}
                    strokeWidth={1.5}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className={cn(
                        currentSize.dot,
                        "rounded-full",
                        !isMonochrome && "bg-primary animate-pulse",
                        isMonochrome && "bg-current"
                    )}></div>
                </div>
            </div>

            {showText && (
                <div className="leading-none ml-1">
                    <span className={cn(
                        "font-black tracking-[0.2em] uppercase",
                        currentSize.text,
                        !isMonochrome && "text-transparent bg-clip-text bg-gradient-to-r from-primary to-foreground",
                        isMonochrome && "text-current"
                    )}>
                        Compass
                    </span>
                </div>
            )}
        </div>
    )

    if (href) {
        return <Link href={href}>{content}</Link>
    }

    return content
}
