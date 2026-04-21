'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bell, Check, Clock } from "lucide-react"
import { Notification } from "@/lib/types"
import { useRouter } from "next/navigation"
import { markNotificationAsRead } from "@/lib/actions/notifications"
import { toast } from "sonner"
import { toastSuccess } from "@/lib/toast-success"
import { useState } from "react"

interface NotificationCenterWidgetProps {
    notifications: Notification[] // These should be unread or recent
    totalUnread: number
}

export function NotificationCenterWidget({ notifications: initialNotifications, totalUnread }: NotificationCenterWidgetProps) {
    const router = useRouter()
    const [notifications, setNotifications] = useState(initialNotifications)

    const handleMarkAsRead = async (id: string) => {
        try {
            const result = await markNotificationAsRead(id)
            if (result.success) {
                setNotifications(prev => prev.filter(n => n.id !== id))
                toastSuccess("Oznaczono jako przeczytane")
                router.refresh()
            }
        } catch (error) {
            toast.error("Błąd aktualizacji")
        }
    }

    return (
        <Card className="bg-white/5 border-white/10 h-full flex flex-col card-hover">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                    <Bell className="w-4 h-4" />
                    Powiadomienia
                    {totalUnread > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                            {totalUnread}
                        </span>
                    )}
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-slate-600 hover:text-white" onClick={() => router.push('/notifications')}>
                    Wszystkie
                </Button>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 relative">
                {notifications.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs text-center py-6">
                        <Bell className="w-8 h-8 opacity-20 mb-2" />
                        <p>Brak nowych powiadomień</p>
                    </div>
                ) : (
                    <ScrollArea className="h-[200px] md:h-full pr-4">
                        <div className="space-y-3">
                            {notifications.map((notification) => (
                                <div key={notification.id} className="group relative bg-white/5 hover:bg-white/10 p-3 rounded-lg transition-colors border-l-2 border-primary">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-200 leading-tight mb-1">
                                                {notification.title_pl}
                                            </p>
                                            <p className="text-xs text-slate-600 line-clamp-2">
                                                {notification.body_pl}
                                            </p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="text-[10px] text-slate-600 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(notification.created_at).toLocaleDateString('pl-PL')}
                                                </span>
                                                {notification.priority === 'urgent' && (
                                                    <span className="text-[10px] text-red-400 font-bold uppercase tracking-wide">Pilne</span>
                                                )}
                                            </div>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-green-400 hover:bg-green-400/10"
                                            onClick={() => handleMarkAsRead(notification.id)}
                                            title="Oznacz jako przeczytane"
                                        >
                                            <Check className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    )
}
