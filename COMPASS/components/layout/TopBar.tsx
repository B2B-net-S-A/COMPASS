'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/context'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { Logo } from '@/components/common/Logo'
import { Menu } from 'lucide-react'

interface TopBarProps {
    user?: {
        full_name?: string | null
        email?: string | null
        avatar_url?: string | null
    } | null
    onMenuToggle?: () => void
}

export function TopBar({ user, onMenuToggle }: TopBarProps) {
    const router = useRouter()
    const supabase = createClient()
    const { t } = useTranslation()

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    const initials = user?.full_name
        ? user.full_name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
        : user?.email?.slice(0, 2).toUpperCase() || 'U'

    return (
        <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b bg-card px-4 md:px-6">
            <div className="flex items-center gap-3 md:hidden">
                {onMenuToggle && (
                    <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuToggle}>
                        <Menu className="w-5 h-5" />
                    </Button>
                )}
                <Logo size="sm" showText={true} />
            </div>

            <div className="hidden md:block" />

            <div className="flex items-center gap-3">
                <NotificationBell />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={user?.avatar_url || ''} alt={user?.full_name || ''} />
                                <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">{user?.full_name}</p>
                                <p className="text-xs leading-none text-muted-foreground">
                                    {user?.email}
                                </p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/home">{t('profile')}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href="/settings">{t('settings')}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleSignOut}>
                            {t('logout')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    )
}
