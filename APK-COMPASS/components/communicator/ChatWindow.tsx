
'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Conversation, getMessages, markAsRead, sendMessage } from '@/lib/actions/communicator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Send, X, Paperclip } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'

interface ChatWindowProps {
    conversation: Conversation
    currentUser: {
        id: string
        full_name?: string
        avatar_url?: string
    }
    onBack: () => void
    onClose?: () => void
}

export function ChatWindow({ conversation, currentUser, onBack, onClose }: ChatWindowProps) {
    const [messages, setMessages] = useState<any[]>([])
    const [newMessage, setNewMessage] = useState('')
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = createClient()

    // Determine chat title and avatar
    const otherParticipant = conversation.participants?.[0]
    const chatTitle = conversation.type === 'broadcast'
        ? (conversation.name || 'Ogłoszenia')
        : (otherParticipant?.full_name || 'Użytkownik')

    const chatAvatar = conversation.type === 'broadcast'
        ? null
        : otherParticipant?.avatar_url

    // Check permissions for input
    const canSend = conversation.type === 'direct' ||
        (conversation.type === 'broadcast' && conversation.owner_id === currentUser.id)

    // Load messages
    useEffect(() => {
        let isMounted = true

        const load = async () => {
            setLoading(true)
            const { data, error } = await getMessages(conversation.id)
            if (error) {
                toast.error('Nie udało się pobrać wiadomości')
            } else if (isMounted) {
                setMessages(data)
                // Mark as read
                markAsRead(conversation.id)
            }
            setLoading(false)
        }

        load()

        // Realtime subscription
        const channel = supabase
            .channel(`chat:${conversation.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversation.id}`
            }, (payload) => {
                const newMsg = payload.new as any
                if (newMsg.sender_id === currentUser.id) return // Ignore own if handled optimistically

                // Quick fetch of sender for correct display
                supabase.from('profiles').select('full_name, avatar_url').eq('id', newMsg.sender_id).single()
                    .then(({ data: profile }) => {
                        const fullMsg = {
                            ...newMsg,
                            sender: profile
                        }
                        setMessages(prev => [...prev, fullMsg])
                        markAsRead(conversation.id)
                    })
            })
            .subscribe()

        return () => {
            isMounted = false
            supabase.removeChannel(channel)
        }
    }, [conversation.id, currentUser.id, supabase])

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, loading])

    const handleSend = async () => {
        if (!newMessage.trim() || sending) return

        const content = newMessage.trim()
        setNewMessage('')
        setSending(true)

        // Optimistic update
        const optimisticMsg = {
            id: 'optimistic-' + Date.now(),
            content,
            created_at: new Date().toISOString(),
            sender_id: currentUser.id,
            type: 'text',
            sender: {
                full_name: currentUser.full_name,
                avatar_url: currentUser.avatar_url
            }
        }
        setMessages(prev => [...prev, optimisticMsg])

        const { error } = await sendMessage(conversation.id, content)
        if (error) {
            toast.error('Błąd wysyłania')
            setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
        }

        setSending(false)
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            toast.error("Plik jest za duży (max 5MB)")
            return
        }

        setIsUploading(true)

        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${Date.now()}.${fileExt}`
            const filePath = `${conversation.id}/${currentUser.id}/${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('chat-attachments')
                .upload(filePath, file)

            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from('chat-attachments')
                .getPublicUrl(filePath)

            // Determine type
            const type = file.type.startsWith('image/') ? 'image' : 'file'

            // Send message with attachment
            const { error: sendError } = await sendMessage(
                conversation.id,
                file.name,
                type,
                publicUrl
            )

            if (sendError) throw sendError

            // Optimistic update (simplified, ideally we'd show the image immediately)
            /* 
            const optimisticMsg = {
                id: 'optimistic-' + Date.now(),
                content: file.name,
                created_at: new Date().toISOString(),
                sender_id: currentUser.id,
                type: type,
                attachment_url: publicUrl,
                sender: {
                    full_name: currentUser.full_name,
                    avatar_url: currentUser.avatar_url
                }
            }
            setMessages(prev => [...prev, optimisticMsg])
            */

        } catch (error: any) {
            console.error('Upload error:', error)
            toast.error("Błąd wysyłania pliku")
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b bg-muted/40 shrink-0">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>

                    <Avatar className="h-8 w-8">
                        <AvatarImage src={chatAvatar || undefined} />
                        <AvatarFallback>{chatTitle?.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>

                    <div>
                        <div className="text-sm font-semibold leading-none">{chatTitle}</div>
                        {conversation.type === 'broadcast' && (
                            <div className="text-[10px] text-muted-foreground">Kanał informacyjny</div>
                        )}
                    </div>
                </div>

                {onClose && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
                {loading ? (
                    <div className="flex justify-center items-center h-40">
                        <span className="loading loading-spinner loading-sm text-muted-foreground">Ładowanie...</span>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm opacity-50 mt-10">
                        <p>Brak wiadomości</p>
                        {canSend && <p>Napisz jako pierwszy!</p>}
                    </div>
                ) : (
                    <div className="flex flex-col justify-end min-h-full">
                        {messages.map((msg) => (
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
                        ))}
                        <div ref={scrollRef} />
                    </div>
                )}
            </ScrollArea>

            {/* Input */}
            <div className="p-3 border-t bg-background shrink-0">
                {canSend ? (
                    <div className="flex items-end gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="image/*,.pdf,.doc,.docx,.txt" // Allow common types
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-muted"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading || sending}
                        >
                            <Paperclip className="h-5 w-5" />
                        </Button>
                        <Input
                            placeholder="Napisz wiadomość..."
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="flex-1 min-h-[40px]"
                            autoFocus
                            disabled={isUploading}
                        />
                        <Button
                            onClick={handleSend}
                            disabled={!newMessage.trim() || sending || isUploading}
                            size="icon"
                            className="h-10 w-10 shrink-0"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="text-center text-xs text-muted-foreground py-2 bg-muted/20 rounded-md">
                        To jest kanał tylko do odczytu.
                    </div>
                )}
            </div>
        </div>
    )
}
