
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MessageCircle, X } from 'lucide-react'
import { ConversationList } from './ConversationList'
import { ChatWindow } from './ChatWindow'
import { Conversation, getConversations } from '@/lib/actions/communicator'
import { createClient } from '@/lib/supabase/client'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface InternalCommunicatorProps {
    currentUser: {
        id: string
        full_name?: string
        avatar_url?: string
    }
}

export function InternalCommunicator({ currentUser }: InternalCommunicatorProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
    const [activeConversation, setActiveConversation] = useState<Conversation | undefined>(undefined)
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [unreadCount, setUnreadCount] = useState(0)

    const pathname = usePathname()
    // Hide widget on dedicated messages page if we build one, but for now we only have widget.
    const isMessagesPage = pathname === '/messages'

    useEffect(() => {
        const refreshConversations = async () => {
            const { data } = await getConversations()
            if (data) {
                setConversations(data)
                const count = data.reduce((acc, conv) => {
                    const lastMsg = conv.last_message
                    const isUnread = lastMsg && !lastMsg.is_read && lastMsg.sender_id !== currentUser.id
                    return acc + (isUnread ? 1 : 0)
                }, 0)
                setUnreadCount(count)
            }
        }

        refreshConversations()

        // Subscribe to NEW messages globally to update unread count/list
        const supabase = createClient()
        const channel = supabase
            .channel('global_communicator')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, () => {
                // Determine if this message is for me.
                // We need to fetch conversations again because we don't know participants from just message INSERT payload easily without extra query.
                // But efficient enough for MVP.
                refreshConversations()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [currentUser.id])

    const handleSelectConversation = (id: string, conversation?: Conversation) => {
        setActiveConversationId(id)
        setActiveConversation(conversation)
    }

    if (isMessagesPage) return null // Use page layout instead

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
            <div className={cn(
                "transition-all duration-300 ease-in-out origin-bottom-right mb-4",
                isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none h-0 w-0 overflow-hidden"
            )}>
                <Card className="w-[350px] h-[500px] shadow-2xl flex flex-col overflow-hidden border-primary/20">
                    {activeConversationId && activeConversation ? (
                        <ChatWindow
                            conversation={activeConversation}
                            currentUser={currentUser}
                            onBack={() => setActiveConversationId(null)}
                            onClose={() => setIsOpen(false)}
                        />
                    ) : (
                        <ConversationList
                            conversations={conversations}
                            onSelect={handleSelectConversation}
                            currentUser={currentUser}
                            onClose={() => setIsOpen(false)}
                        />
                    )}
                </Card>
            </div>

            <Button
                onClick={() => setIsOpen(!isOpen)}
                size="icon"
                className={cn(
                    "h-14 w-14 rounded-full shadow-lg transition-transform hover:scale-105",
                    isOpen ? "rotate-90 bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90"
                )}
            >
                {isOpen ? (
                    <X className="h-6 w-6" />
                ) : (
                    <div className="relative">
                        <MessageCircle className="h-6 w-6" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-1 ring-white">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </div>
                )}
            </Button>
        </div>
    )
}
