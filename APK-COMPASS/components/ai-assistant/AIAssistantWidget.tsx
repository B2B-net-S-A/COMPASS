'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bot, X, Send, ThumbsUp, ThumbsDown, Sparkles, Loader2 } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { askAIAssistant, submitAIFeedback, type AIMessage } from '@/lib/actions/ai-assistant'
import { useAIAssistantPreferences, GLOW_COLOR_CONFIG } from '@/lib/contexts/AIAssistantPreferencesContext'

interface Message extends AIMessage {
    id: string
    logId?: string | null
    feedback?: boolean | null
    isLoading?: boolean
    error?: string
}

const SUGGESTED_QUESTIONS = [
    'Jak nawigować po aplikacji?',
    'Jakie dokumenty są w systemie?',
    'Jak działają uprawnienia ról?',
    'Jak działa program lojalnościowy?',
]

export function AIAssistantWidget() {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const pathname = usePathname()
    const { preferences } = useAIAssistantPreferences()

    const glowConfig = GLOW_COLOR_CONFIG[preferences.glowColor]
    const showGlow = preferences.glowEnabled && preferences.glowColor !== 'none'

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages])

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 300)
        }
    }, [isOpen])

    const handleSend = useCallback(async (text?: string) => {
        const question = (text || input).trim()
        if (!question || isTyping) return

        setInput('')

        // Add user message
        const userMsg: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: question,
        }

        // Add loading placeholder
        const loadingMsg: Message = {
            id: `loading-${Date.now()}`,
            role: 'assistant',
            content: '',
            isLoading: true,
        }

        setMessages(prev => [...prev, userMsg, loadingMsg])
        setIsTyping(true)

        // Build conversation history (last 10 messages for context)
        const history: AIMessage[] = messages
            .filter(m => !m.isLoading && !m.error)
            .slice(-10)
            .map(m => ({ role: m.role, content: m.content }))

        try {
            const response = await askAIAssistant(question, history, pathname)

            setMessages(prev => {
                const updated = prev.filter(m => m.id !== loadingMsg.id)
                if (response.error) {
                    return [...updated, {
                        id: `error-${Date.now()}`,
                        role: 'assistant' as const,
                        content: response.error,
                        error: response.error,
                    }]
                }
                return [...updated, {
                    id: `ai-${Date.now()}`,
                    role: 'assistant' as const,
                    content: response.message,
                    logId: response.logId,
                }]
            })
        } catch {
            setMessages(prev => {
                const updated = prev.filter(m => m.id !== loadingMsg.id)
                return [...updated, {
                    id: `error-${Date.now()}`,
                    role: 'assistant' as const,
                    content: 'Przepraszam, wystąpił błąd. Spróbuj ponownie.',
                    error: 'connection_error',
                }]
            })
        } finally {
            setIsTyping(false)
        }
    }, [input, isTyping, messages, pathname])

    const handleFeedback = async (msgId: string, logId: string, helpful: boolean) => {
        setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m, feedback: helpful } : m
        ))
        await submitAIFeedback(logId, helpful)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleClear = () => {
        setMessages([])
    }

    return (
        <div className="fixed bottom-4 right-24 z-50 flex flex-col items-end">
            {/* Glow animation styles */}
            {showGlow && !isOpen && (
                <style jsx global>{`
                    @keyframes ai-glow-pulse {
                        0%, 100% {
                            box-shadow: 0 0 15px ${glowConfig.preview}40, 0 0 30px ${glowConfig.preview}20, 0 0 45px ${glowConfig.preview}10;
                        }
                        50% {
                            box-shadow: 0 0 25px ${glowConfig.preview}60, 0 0 50px ${glowConfig.preview}35, 0 0 75px ${glowConfig.preview}15;
                        }
                    }
                    .ai-glow-button {
                        animation: ai-glow-pulse 2.5s ease-in-out infinite;
                    }
                `}</style>
            )}

            {/* Chat Window */}
            <div className={cn(
                "transition-all duration-300 ease-in-out origin-bottom-right mb-4",
                isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none h-0 w-0 overflow-hidden"
            )}>
                <Card className={cn(
                    "w-[calc(100vw-2rem)] sm:w-[380px] h-[520px] shadow-2xl flex flex-col overflow-hidden bg-background",
                    glowConfig.borderClass
                )}>
                    {/* Header */}
                    <div className={cn(
                        "flex items-center justify-between p-3 border-b shrink-0 bg-gradient-to-r",
                        glowConfig.gradientFrom,
                        glowConfig.gradientTo
                    )}>
                        <div className="flex items-center gap-2">
                            <div
                                className="h-8 w-8 rounded-full flex items-center justify-center bg-gradient-to-br"
                                style={{
                                    background: `linear-gradient(135deg, ${glowConfig.preview}, ${glowConfig.preview}cc)`,
                                }}
                            >
                                <Bot className="h-4 w-4 text-white" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold leading-none">Asystent AI</div>
                                <div className="text-[10px] text-muted-foreground">Nawigacja, dokumenty, uprawnienia</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {messages.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[10px] text-muted-foreground hover:text-foreground"
                                    onClick={handleClear}
                                >
                                    Wyczyść
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <ScrollArea className="flex-1 p-4">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full">
                                <div
                                    className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
                                    style={{
                                        background: `linear-gradient(135deg, ${glowConfig.preview}33, ${glowConfig.preview}1a)`,
                                    }}
                                >
                                    <Sparkles className="h-8 w-8" style={{ color: glowConfig.preview }} />
                                </div>
                                <p className="text-sm font-medium mb-1">Cześć! Jak mogę pomóc?</p>
                                <p className="text-xs text-muted-foreground text-center mb-6 max-w-[260px]">
                                    Zapytaj o nawigację, dokumenty, uprawnienia lub dowolną funkcję systemu.
                                </p>

                                {/* Suggested questions */}
                                <div className="space-y-2 w-full">
                                    {SUGGESTED_QUESTIONS.map((q, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleSend(q)}
                                            className="w-full text-left text-xs p-2.5 rounded-lg border border-dashed border-muted-foreground/30 hover:border-burgundy/50 hover:bg-burgundy/5 transition-colors text-muted-foreground hover:text-foreground"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {messages.map((msg) => (
                                    <div key={msg.id} className={cn(
                                        "flex flex-col",
                                        msg.role === 'user' ? 'items-end' : 'items-start'
                                    )}>
                                        <div className={cn(
                                            "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                                            msg.role === 'user'
                                                ? 'text-white rounded-br-md'
                                                : msg.error
                                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20 rounded-bl-md'
                                                    : 'bg-muted rounded-bl-md'
                                        )}
                                        style={msg.role === 'user' ? {
                                            background: `linear-gradient(135deg, ${glowConfig.preview}, ${glowConfig.preview}cc)`,
                                        } : undefined}
                                        >
                                            {msg.isLoading ? (
                                                <div className="flex items-center gap-2 py-1">
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    <span className="text-xs text-muted-foreground">Myślę...</span>
                                                </div>
                                            ) : (
                                                <span className="whitespace-pre-wrap">{msg.content}</span>
                                            )}
                                        </div>

                                        {/* Feedback buttons for AI messages */}
                                        {msg.role === 'assistant' && !msg.isLoading && !msg.error && msg.logId && (
                                            <div className="flex items-center gap-1 mt-1 ml-1">
                                                {msg.feedback === undefined || msg.feedback === null ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleFeedback(msg.id, msg.logId!, true)}
                                                            className="p-1 rounded hover:bg-green-500/10 text-muted-foreground hover:text-green-500 transition-colors"
                                                            title="Pomocne"
                                                        >
                                                            <ThumbsUp className="h-3 w-3" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleFeedback(msg.id, msg.logId!, false)}
                                                            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                                                            title="Niepomocne"
                                                        >
                                                            <ThumbsDown className="h-3 w-3" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {msg.feedback ? '👍 Dzięki!' : '👎 Popracuję nad tym'}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div ref={scrollRef} />
                            </div>
                        )}
                    </ScrollArea>

                    {/* Input */}
                    <div className="p-3 border-t bg-background shrink-0">
                        <div className="flex items-center gap-2">
                            <Input
                                ref={inputRef}
                                placeholder="Zadaj pytanie..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="flex-1 min-h-[40px] border-muted-foreground/20 focus-visible:ring-burgundy/30"
                                disabled={isTyping}
                            />
                            <Button
                                onClick={() => handleSend()}
                                disabled={!input.trim() || isTyping}
                                size="icon"
                                className="h-10 w-10 shrink-0"
                                style={{
                                    background: `linear-gradient(135deg, ${glowConfig.preview}, ${glowConfig.preview}cc)`,
                                }}
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-[9px] text-muted-foreground text-center mt-1.5">
                            AI może popełniać błędy. Weryfikuj ważne informacje.
                        </p>
                    </div>
                </Card>
            </div>

            {/* Floating Button with Glow */}
            <div className="relative">
                {/* Glow ring (pulsing) */}
                {showGlow && !isOpen && (
                    <div
                        className="absolute inset-0 rounded-full animate-ping opacity-20"
                        style={{
                            background: glowConfig.preview,
                        }}
                    />
                )}
                <Button
                    onClick={() => setIsOpen(!isOpen)}
                    size="icon"
                    className={cn(
                        "h-14 w-14 rounded-full shadow-lg transition-all hover:scale-105 relative z-10",
                        isOpen && "rotate-90 bg-destructive hover:bg-destructive/90",
                        showGlow && !isOpen && "ai-glow-button"
                    )}
                    style={!isOpen ? {
                        background: `linear-gradient(135deg, ${glowConfig.preview}, ${glowConfig.preview}cc)`,
                    } : undefined}
                >
                    {isOpen ? (
                        <X className="h-6 w-6" />
                    ) : (
                        <Bot className="h-6 w-6" />
                    )}
                </Button>
            </div>
        </div>
    )
}
