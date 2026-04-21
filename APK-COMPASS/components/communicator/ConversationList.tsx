
'use client'

import { useState } from 'react'
import { Conversation, getOrCreateDirectConversation, searchUsersToMessage } from '@/lib/actions/communicator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageSquare, Plus, Search, Megaphone } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ConversationListProps {
    conversations: Conversation[]
    onSelect: (id: string, conversation?: Conversation) => void
    currentUser: { id: string }
    onClose?: () => void
}

export function ConversationList({ conversations, onSelect, currentUser, onClose }: ConversationListProps) {
    const [view, setView] = useState<'list' | 'search'>('list')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)

    const handleSearch = async (query: string) => {
        setSearchQuery(query)
        if (query.length < 2) {
            setSearchResults([])
            return
        }

        setSearching(true)
        const { data, error } = await searchUsersToMessage(query)
        if (error) {
            console.error(error)
        } else {
            setSearchResults(data)
        }
        setSearching(false)
    }

    const handleStartChat = async (targetUserId: string) => {
        const { id, error } = await getOrCreateDirectConversation(targetUserId)
        if (error) {
            toast.error(error)
        } else if (id) {
            // Check if existing in list to pass full obj, else partial
            const existing = conversations.find(c => c.id === id)
            if (existing) {
                onSelect(id, existing)
            } else {
                // We need to re-fetch conversations or blindly open chat window
                // Since ChatWidget handles state, we can just trigger select.
                // But ChatWidget needs the conversation object to render ChatWindow.
                // We restart.
                window.location.reload() // MVP: easy refresh to get new conversation
            }
        }
    }

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="p-3 border-b flex items-center justify-between bg-muted/20">
                <h2 className="text-sm font-semibold">
                    {view === 'list' ? 'Wiadomości' : 'Nowa wiadomość'}
                </h2>
                <div className="flex gap-1">
                    {view === 'list' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setView('search')}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    )}
                    {view === 'search' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setView('list')}>
                            <MessageSquare className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {view === 'list' ? (
                <ScrollArea className="flex-1">
                    {conversations.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground mt-4">
                            Brak rozmów.
                            <br />
                            Kliknij + aby rozpocząć.
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {conversations.map(conv => {
                                const otherParticipant = conv.participants?.[0]
                                const title = conv.type === 'broadcast'
                                    ? (conv.name || 'Ogłoszenia')
                                    : (otherParticipant?.full_name || 'Użytkownik')

                                const avatar = conv.type === 'broadcast'
                                    ? null
                                    : otherParticipant?.avatar_url

                                const lastMsg = conv.last_message
                                const isUnread = lastMsg && !lastMsg.is_read && lastMsg.sender_id !== currentUser.id

                                return (
                                    <button
                                        key={conv.id}
                                        onClick={() => onSelect(conv.id, conv)}
                                        className={cn(
                                            "flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b last:border-0",
                                            isUnread && "bg-muted/30"
                                        )}
                                    >
                                        <div className="relative">
                                            <Avatar className="h-10 w-10">
                                                <AvatarImage src={avatar || undefined} />
                                                <AvatarFallback className={conv.type === 'broadcast' ? 'bg-primary/10 text-primary' : ''}>
                                                    {conv.type === 'broadcast' ? <Megaphone className="h-5 w-5" /> : title?.slice(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            {isUnread && (
                                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className={cn("text-sm truncate", isUnread ? "font-bold" : "font-medium")}>
                                                    {title}
                                                </span>
                                                {lastMsg && (
                                                    <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                                                        {formatDistanceToNow(new Date(lastMsg.created_at), { addSuffix: true, locale: pl })}
                                                    </span>
                                                )}
                                            </div>
                                            {lastMsg ? (
                                                <p className={cn(
                                                    "text-xs truncate",
                                                    isUnread ? "text-foreground font-medium" : "text-muted-foreground"
                                                )}>
                                                    {lastMsg.sender_id === currentUser.id ? 'Ty: ' : ''}{lastMsg.content}
                                                </p>
                                            ) : (
                                                <p className="text-xs text-muted-foreground italic">
                                                    Rozpocznij konwersację
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </ScrollArea>
            ) : (
                <div className="flex flex-col h-full">
                    <div className="p-3 border-b">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Szukaj użytkownika..."
                                className="pl-9"
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    <ScrollArea className="flex-1">
                        {searching ? (
                            <div className="p-4 text-center text-xs text-muted-foreground">Szukanie...</div>
                        ) : searchResults.length === 0 && searchQuery.length >= 2 ? (
                            <div className="p-4 text-center text-xs text-muted-foreground">Nie znaleziono użytkowników.</div>
                        ) : (
                            <div className="flex flex-col">
                                {searchResults.map(user => (
                                    <button
                                        key={user.id}
                                        onClick={() => handleStartChat(user.id)}
                                        className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                                    >
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={user.avatar_url} />
                                            <AvatarFallback>{user.full_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="text-sm font-medium">{user.full_name}</div>
                                            <div className="text-xs text-muted-foreground capitalize">
                                                {user.role === 'admin' ? 'Administrator' : 'Konsultant'}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            )}
        </div>
    )
}
