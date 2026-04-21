
'use client'

import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { format } from 'date-fns'
import { Check, CheckCheck } from 'lucide-react'

interface MessageBubbleProps {
    content: string
    senderName?: string
    senderAvatar?: string
    isOwn: boolean
    timestamp: string
    isRead?: boolean
    type?: 'text' | 'image' | 'file' | 'system'
    attachmentUrl?: string | null
}

export function MessageBubble({
    content,
    senderName,
    senderAvatar,
    isOwn,
    timestamp,
    isRead,
    type = 'text',
    attachmentUrl
}: MessageBubbleProps) {
    if (type === 'system') {
        return (
            <div className="flex justify-center my-4">
                <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                    {content}
                </span>
            </div>
        )
    }

    return (
        <div className={cn("flex w-full gap-2 mb-4", isOwn ? "justify-end" : "justify-start")}>
            {!isOwn && (
                <Avatar className="h-8 w-8 mt-1">
                    <AvatarImage src={senderAvatar} alt={senderName} />
                    <AvatarFallback>{senderName?.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
            )}

            <div className={cn(
                "max-w-[70%] flex flex-col",
                isOwn ? "items-end" : "items-start"
            )}>
                {!isOwn && senderName && (
                    <span className="text-xs text-muted-foreground mb-1 ml-1">{senderName}</span>
                )}

                <div className={cn(
                    "px-4 py-2 rounded-2xl text-sm break-words shadow-sm overflow-hidden",
                    isOwn
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted text-foreground rounded-tl-none border border-border/50",
                    type === 'image' && "p-0 bg-transparent border-0"
                )}>
                    {type === 'image' && attachmentUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={attachmentUrl}
                            alt="Załącznik"
                            className="max-w-full rounded-lg max-h-[300px] object-cover"
                            loading="lazy"
                        />
                    ) : type === 'file' && attachmentUrl ? (
                        <a
                            href={attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 underline decoration-dotted underline-offset-4 hover:decoration-solid"
                        >
                            📎 {content || "Pobierz plik"}
                        </a>
                    ) : (
                        content
                    )}
                </div>

                <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/80">
                    <span>{format(new Date(timestamp), 'HH:mm')}</span>
                    {isOwn && (
                        <span>
                            {isRead ? <CheckCheck className="h-3 w-3 text-primary" /> : <Check className="h-3 w-3" />}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
