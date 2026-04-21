'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    Conversation,
    getConversations,
    getMessages,
    sendMessage,
    markAsRead,
    searchUsersToMessage,
    getAllUsersToMessage,
    getOrCreateDirectConversation
} from '@/lib/actions/communicator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { MessageBubble } from '@/components/communicator/MessageBubble'
import { BroadcastComposer } from './BroadcastComposer'
import {
    MessageCircle,
    Send,
    Search,
    Megaphone,
    Users,
    Paperclip,
    Plus,
    Loader2,
    ArrowLeft,
    X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

interface MessagesPageClientProps {
    currentUser: {
        id: string
        full_name: string
        avatar_url: string
        email: string
    }
    isAdmin: boolean
}

export function MessagesPageClient({ currentUser, isAdmin }: MessagesPageClientProps) {
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
    const [messages, setMessages] = useState<any[]>([])
    const [newMessage, setNewMessage] = useState('')
    const [loading, setLoading] = useState(true)
    const [loadingMessages, setLoadingMessages] = useState(false)
    const [sending, setSending] = useState(false)
    const [broadcastOpen, setBroadcastOpen] = useState(false)

    // Search state
    const [searchMode, setSearchMode] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [allUsers, setAllUsers] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const [loadingUsers, setLoadingUsers] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const supabase = createClient()

    // Split conversations into broadcasts and directs
    const broadcasts = conversations.filter(c => c.type === 'broadcast')
    const directs = conversations.filter(c => c.type === 'direct')

    // Load conversations
    useEffect(() => {
        const loadConversations = async () => {
            setLoading(true)
            const { data } = await getConversations()
            if (data) setConversations(data)
            setLoading(false)
        }
        loadConversations()

        // Realtime subscription
        const channel = supabase
            .channel('messages_page_realtime')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                // If message is for active conversation, add it
                if (payload.new && (payload.new as any).conversation_id === activeConversationId) {
                    setMessages(prev => [...prev, payload.new])
                    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
                }
                // Refresh conversation list
                loadConversations()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [currentUser.id])

    // Load messages when conversation changes
    useEffect(() => {
        if (!activeConversationId) return
        const load = async () => {
            setLoadingMessages(true)
            const { data } = await getMessages(activeConversationId)
            if (data) setMessages(data)
            setLoadingMessages(false)
            await markAsRead(activeConversationId)
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
        load()
    }, [activeConversationId])

    // Load all users when search mode opens
    useEffect(() => {
        if (!searchMode) return
        if (allUsers.length > 0) return
        const loadUsers = async () => {
            setLoadingUsers(true)
            const { data } = await getAllUsersToMessage()
            setAllUsers(data || [])
            setLoadingUsers(false)
        }
        loadUsers()
    }, [searchMode])

    // Filter users as the user types (client-side for instant UX, server-side fallback for deeper search)
    useEffect(() => {
        if (!searchQuery || searchQuery.length < 1) {
            setSearchResults([])
            return
        }
        const q = searchQuery.toLowerCase()
        const filtered = allUsers.filter(u =>
            u.full_name?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q) ||
            u.role?.toLowerCase().includes(q)
        )
        setSearchResults(filtered)

        if (filtered.length === 0 && searchQuery.length >= 2) {
            const timer = setTimeout(async () => {
                setSearching(true)
                const { data } = await searchUsersToMessage(searchQuery)
                setSearchResults(data || [])
                setSearching(false)
            }, 300)
            return () => clearTimeout(timer)
        }
    }, [searchQuery, allUsers])

    const handleSelectConversation = (conv: Conversation) => {
        setActiveConversationId(conv.id)
        setActiveConversation(conv)
        setSearchMode(false)
    }

    const handleStartConversation = async (userId: string) => {
        const { id, error } = await getOrCreateDirectConversation(userId)
        if (error) {
            toast.error(error)
            return
        }
        if (id) {
            setActiveConversationId(id)
            // Refresh conversations to get the new one
            const { data } = await getConversations()
            if (data) {
                setConversations(data)
                const found = data.find(c => c.id === id)
                if (found) setActiveConversation(found)
            }
        }
        setSearchMode(false)
        setSearchQuery('')
    }

    const handleSend = async () => {
        if (!newMessage.trim() || !activeConversationId) return
        setSending(true)
        const { error } = await sendMessage(activeConversationId, newMessage.trim())
        if (error) {
            toast.error(error)
        } else {
            setNewMessage('')
            // Optimistic: message will arrive via realtime
        }
        setSending(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // Permissions for sending in broadcast
    const canSendInActive = activeConversation?.type === 'direct' ||
        (activeConversation?.type === 'broadcast' && activeConversation?.owner_id === currentUser.id)

    const otherParticipant = activeConversation?.participants?.[0]
    const chatTitle = activeConversation?.type === 'broadcast'
        ? (activeConversation.name || 'Ogłoszenie')
        : (otherParticipant?.full_name || 'Użytkownik')

    return (
        <div className="flex h-full rounded-xl border border-white/10 overflow-hidden bg-black/20">
            {/* Left Panel - Conversation List */}
            <div className="w-80 lg:w-96 border-r border-white/10 flex flex-col shrink-0">
                {/* Header */}
                <div className="p-4 border-b border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <MessageCircle className="w-5 h-5 text-slate-200" />
                            Wiadomości
                        </h2>
                        <div className="flex gap-2">
                            {isAdmin && (
                                <Button
                                    size="sm"
                                    onClick={() => setBroadcastOpen(true)}
                                    className="bg-amber-600 hover:bg-amber-500 text-xs gap-1"
                                >
                                    <Megaphone className="w-3.5 h-3.5" />
                                    Ogłoszenie
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSearchMode(!searchMode)}
                                className="border-white/10 text-xs gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Nowa
                            </Button>
                        </div>
                    </div>

                    {/* Search new conversation */}
                    {searchMode && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Szukaj osoby do napisania..."
                                className="pl-10 bg-white/5 border-white/10 text-sm"
                                autoFocus
                            />
                            {searchQuery && (
                                <button onClick={() => { setSearchQuery(''); setSearchMode(false) }} className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <X className="w-4 h-4 text-slate-600" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Recipients List / Search Results */}
                {searchMode && (
                    <div className="border-b border-white/10 max-h-72 overflow-y-auto">
                        {loadingUsers || searching ? (
                            <div className="p-4 text-center">
                                <Loader2 className="w-4 h-4 animate-spin mx-auto text-slate-600" />
                                <p className="text-[10px] text-slate-600 mt-1">Ładowanie listy...</p>
                            </div>
                        ) : (() => {
                            const usersToShow = searchQuery.length >= 1 ? searchResults : allUsers
                            if (usersToShow.length === 0) {
                                return (
                                    <div className="p-4 text-center text-xs text-slate-600">
                                        {searchQuery ? 'Nie znaleziono' : 'Brak dostępnych odbiorców'}
                                    </div>
                                )
                            }

                            const ROLE_LABELS: Record<string, string> = {
                                administrator: 'Administrator',
                                centrala: 'Centrala',
                                consultant: 'Konsultant',
                            }

                            return usersToShow.map(user => (
                                <button
                                    key={user.id}
                                    onClick={() => handleStartConversation(user.id)}
                                    className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left"
                                >
                                    <Avatar className="w-8 h-8">
                                        <AvatarImage src={user.avatar_url} />
                                        <AvatarFallback className="bg-slate-200/20 text-slate-200 text-xs">
                                            {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">
                                            {user.full_name || user.email}
                                        </div>
                                        <div className="text-[10px] text-slate-600">
                                            {ROLE_LABELS[user.role] || user.role}
                                        </div>
                                    </div>
                                </button>
                            ))
                        })()}
                    </div>
                )}

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-8 text-center">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-600" />
                            <p className="text-xs text-slate-600 mt-2">Ładowanie...</p>
                        </div>
                    ) : (
                        <>
                            {/* Broadcasts Section */}
                            {broadcasts.length > 0 && (
                                <div>
                                    <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5 bg-amber-500/5">
                                        <Megaphone className="w-3 h-3" /> Ogłoszenia
                                    </div>
                                    {broadcasts.map(conv => {
                                        const isActive = conv.id === activeConversationId
                                        const isUnread = conv.last_message && !conv.last_message.is_read && conv.last_message.sender_id !== currentUser.id
                                        return (
                                            <button
                                                key={conv.id}
                                                onClick={() => handleSelectConversation(conv)}
                                                className={cn(
                                                    "w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left border-b border-white/5",
                                                    isActive && "bg-amber-500/10 border-l-2 border-l-amber-500"
                                                )}
                                            >
                                                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                                                    <Megaphone className="w-5 h-5 text-amber-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className={cn("text-sm font-medium truncate", isUnread ? "text-white" : "text-slate-300")}>
                                                            {conv.name || 'Ogłoszenie'}
                                                        </span>
                                                        {conv.last_message && (
                                                            <span className="text-[10px] text-slate-600 shrink-0 ml-2">
                                                                {format(new Date(conv.last_message.created_at), 'dd.MM', { locale: pl })}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {conv.last_message && (
                                                        <p className={cn("text-xs truncate mt-0.5", isUnread ? "text-slate-300" : "text-slate-600")}>
                                                            {conv.last_message.content}
                                                        </p>
                                                    )}
                                                </div>
                                                {isUnread && <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Direct Conversations Section */}
                            <div>
                                <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-slate-200 font-bold flex items-center gap-1.5 bg-slate-200/5">
                                    <MessageCircle className="w-3 h-3" /> Konwersacje
                                </div>
                                {directs.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <MessageCircle className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                                        <p className="text-xs text-slate-600">Brak konwersacji</p>
                                        <p className="text-[10px] text-slate-600 mt-1">Kliknij "Nowa" aby rozpocząć</p>
                                    </div>
                                ) : (
                                    directs.map(conv => {
                                        const other = conv.participants?.[0]
                                        const isActive = conv.id === activeConversationId
                                        const isUnread = conv.last_message && !conv.last_message.is_read && conv.last_message.sender_id !== currentUser.id
                                        return (
                                            <button
                                                key={conv.id}
                                                onClick={() => handleSelectConversation(conv)}
                                                className={cn(
                                                    "w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left border-b border-white/5",
                                                    isActive && "bg-slate-200/10 border-l-2 border-l-foreground"
                                                )}
                                            >
                                                <Avatar className="w-10 h-10 shrink-0">
                                                    <AvatarImage src={other?.avatar_url} />
                                                    <AvatarFallback className="bg-slate-200/20 text-slate-200 text-sm">
                                                        {other?.full_name?.charAt(0) || '?'}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className={cn("text-sm font-medium truncate", isUnread ? "text-white" : "text-slate-300")}>
                                                            {other?.full_name || 'Użytkownik'}
                                                        </span>
                                                        {conv.last_message && (
                                                            <span className="text-[10px] text-slate-600 shrink-0 ml-2">
                                                                {format(new Date(conv.last_message.created_at), 'dd.MM', { locale: pl })}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {conv.last_message && (
                                                        <p className={cn("text-xs truncate mt-0.5", isUnread ? "text-slate-300" : "text-slate-600")}>
                                                            {conv.last_message.sender_id === currentUser.id ? 'Ty: ' : ''}
                                                            {conv.last_message.content}
                                                        </p>
                                                    )}
                                                </div>
                                                {isUnread && <div className="w-2 h-2 rounded-full bg-slate-200 shrink-0" />}
                                            </button>
                                        )
                                    })
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Right Panel - Chat */}
            <div className="flex-1 flex flex-col">
                {!activeConversation ? (
                    /* Empty State */
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                                <MessageCircle className="w-10 h-10 text-slate-600" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-600">Wybierz konwersację</h3>
                            <p className="text-sm text-slate-600 mt-1">Lub rozpocznij nową klikając przycisk "Nowa"</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-white/5">
                            {activeConversation.type === 'broadcast' ? (
                                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                    <Megaphone className="w-5 h-5 text-amber-400" />
                                </div>
                            ) : (
                                <Avatar className="w-10 h-10">
                                    <AvatarImage src={otherParticipant?.avatar_url} />
                                    <AvatarFallback className="bg-slate-200/20 text-slate-200">
                                        {otherParticipant?.full_name?.charAt(0) || '?'}
                                    </AvatarFallback>
                                </Avatar>
                            )}
                            <div>
                                <h3 className="font-bold text-white">{chatTitle}</h3>
                                <p className="text-[10px] text-slate-600">
                                    {activeConversation.type === 'broadcast' ? 'Ogłoszenie dla wszystkich' : 'Konwersacja prywatna'}
                                </p>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {loadingMessages ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex items-center justify-center h-full">
                                    <p className="text-sm text-slate-600">Brak wiadomości. Napisz pierwszą!</p>
                                </div>
                            ) : (
                                messages.map((msg) => (
                                    <MessageBubble
                                        key={msg.id}
                                        content={msg.content}
                                        senderName={msg.sender?.full_name}
                                        senderAvatar={msg.sender?.avatar_url}
                                        isOwn={msg.sender_id === currentUser.id}
                                        timestamp={msg.created_at}
                                        type={msg.type}
                                        attachmentUrl={msg.attachment_url}
                                    />
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        {canSendInActive ? (
                            <div className="p-4 border-t border-white/10 bg-white/5">
                                <div className="flex gap-2">
                                    <Input
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Napisz wiadomość..."
                                        className="bg-black/30 border-white/10 text-sm"
                                        disabled={sending}
                                    />
                                    <Button
                                        onClick={handleSend}
                                        disabled={!newMessage.trim() || sending}
                                        className="bg-burgundy hover:bg-slate-200 px-4"
                                    >
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 border-t border-white/10 bg-white/5 text-center">
                                <p className="text-xs text-slate-600">Ogłoszenia są tylko do odczytu</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Broadcast Composer Dialog */}
            {isAdmin && (
                <BroadcastComposer
                    isOpen={broadcastOpen}
                    onOpenChange={setBroadcastOpen}
                    onSuccess={async () => {
                        const { data } = await getConversations()
                        if (data) setConversations(data)
                    }}
                />
            )}
        </div>
    )
}
