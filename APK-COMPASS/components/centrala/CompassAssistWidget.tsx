'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    MessageSquare,
    X,
    Send,
    Loader2,
    User,
    Bot,
    ChevronDown,
    HeadphonesIcon
} from 'lucide-react'
import { processChat, createAssistTicket, ChatMessage } from '@/lib/actions/compass-assist'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'

interface CompassAssistWidgetProps {
    profileId: string
}

export function CompassAssistWidget({ profileId }: CompassAssistWidgetProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Quick Actions
    const QUICK_ACTIONS = [
        { label: "Moja umowa", query: "Kiedy kończy się mój kontrakt?" },
        { label: "Status faktury", query: "Jaki jest status mojej ostatniej faktury?" },
        { label: "Pakiet medyczny", query: "Jakie mam benefity medyczne?" },
        { label: "Pomoc IT", query: "Mam problem ze sprzętem." }
    ]

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, loading])

    const handleSend = async (text: string = input) => {
        if (!text.trim() || loading) return

        const userMsg: ChatMessage = { role: 'user', content: text }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)

        try {
            const result = await processChat(profileId, text, messages)
            const aiMsg: ChatMessage = { role: 'assistant', content: result.content }
            setMessages(prev => [...prev, aiMsg])
        } catch (err) {
            console.error(err)
            toast.error("Wystąpił błąd podczas komunikacji z AI.")
        } finally {
            setLoading(false)
        }
    }

    const handleEscalate = async () => {
        try {
            await createAssistTicket(
                profileId,
                'general',
                `Eskalacja z czatu: ${messages[messages.length - 1]?.content.substring(0, 100)}...`
            )
            toastSuccess("Zgłoszenie zostało utworzone. Konsultant skontaktuje się z Tobą.")
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Twoja sprawa została przekazana do odpowiedniego działu. Numer zgłoszenia został wysłany na Twój e-mail."
            }])
        } catch (err) {
            console.error(err)
            toast.error("Nie udało się utworzyć zgłoszenia.")
        }
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
            {/* Chat Window */}
            {isOpen && (
                <Card className="w-[calc(100vw-2rem)] sm:w-[380px] h-[550px] shadow-2xl border-white/10 bg-[#1a1a2e] flex flex-col animate-in slide-in-from-bottom-4 duration-300 overflow-hidden">
                    <CardHeader className="bg-burgundy p-4 shrink-0">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-white flex items-center gap-2 text-base">
                                <div className="p-1.5 bg-white/20 rounded-lg">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                                Compass Assist
                            </CardTitle>
                            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={() => setIsOpen(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <p className="text-xs text-foreground mt-2 opacity-80">Twój Cyfrowy Opiekun B2B.net</p>
                    </CardHeader>

                    <CardContent className="flex-1 overflow-hidden p-0 flex flex-col bg-[#0f0f1e]">
                        {/* Messages Area */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10"
                        >
                            {messages.length === 0 && (
                                <div className="space-y-4 py-4">
                                    <div className="p-4 bg-white/5 border border-white/5 rounded-2xl text-center">
                                        <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <MessageSquare className="w-6 h-6 text-slate-200" />
                                        </div>
                                        <p className="text-sm font-medium text-white mb-1">Cześć! W czym mogę pomóc?</p>
                                        <p className="text-xs text-gray-400">Jestem Twoim wirtualnym asystentem. Zapytaj mnie o cokolwiek związanego z Twoim kontraktem.</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {QUICK_ACTIONS.map((action, i) => (
                                            <Button
                                                key={i}
                                                variant="outline"
                                                className="text-[10px] h-auto py-2 bg-white/5 border-white/10 hover:bg-white/10 text-white justify-start"
                                                onClick={() => handleSend(action.query)}
                                            >
                                                {action.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                        <div className={`p-2 rounded-lg shrink-0 ${msg.role === 'user' ? 'bg-burgundy' : 'bg-white/10'}`}>
                                            {msg.role === 'user' ? <User className="w-3 h-3 text-white" /> : <Bot className="w-3 h-3 text-slate-200" />}
                                        </div>
                                        <div className={`p-3 rounded-2xl text-sm whitespace-pre-wrap ${msg.role === 'user'
                                            ? 'bg-burgundy text-white rounded-tr-none shadow-lg'
                                            : 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-none'
                                            }`}>
                                            {msg.content}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="flex gap-2 max-w-[85%]">
                                        <div className="p-2 rounded-lg bg-white/10 shrink-0">
                                            <Bot className="w-3 h-3 text-slate-200" />
                                        </div>
                                        <div className="p-3 bg-white/5 border border-white/10 rounded-2xl rounded-tl-none flex items-center gap-2">
                                            <Loader2 className="w-3 h-3 animate-spin text-slate-200" />
                                            <span className="text-xs text-gray-400 italic">Compass odpowiada...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-4 border-t border-white/10 bg-[#1a1a2e]">
                            {messages.length > 3 && !loading && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full mb-2 text-[10px] text-orange-400 hover:text-orange-300 hover:bg-orange-400/10"
                                    onClick={handleEscalate}
                                >
                                    <HeadphonesIcon className="w-3 h-3 mr-2" />
                                    Połącz z konsultantem (Eskalacja)
                                </Button>
                            )}
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Wpisz wiadomość..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    className="bg-white/5 border-white/10 text-white focus-visible:ring-burgundy h-10 text-sm"
                                />
                                <Button
                                    size="icon"
                                    onClick={() => handleSend()}
                                    disabled={loading || !input.trim()}
                                    className="bg-burgundy hover:bg-blue-700 h-10 w-10 shrink-0"
                                >
                                    <Send className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Toggle Button */}
            <Button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 group ${isOpen ? 'bg-red-500 hover:bg-red-600' : 'bg-burgundy hover:bg-blue-700'
                    }`}
            >
                {isOpen ? (
                    <ChevronDown className="w-6 h-6 animate-in fade-in zoom-in" />
                ) : (
                    <>
                        <div className="absolute -top-1 -right-1 flex h-5 w-5 animate-bounce">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-200 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-5 w-5 bg-primary items-center justify-center text-[10px] font-bold text-white border-2 border-[#1a1a2e]">
                                AI
                            </span>
                        </div>
                        <Bot className="w-7 h-7 group-hover:scale-110 transition-transform" />
                    </>
                )}
            </Button>
        </div>
    )
}
