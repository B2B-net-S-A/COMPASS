'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, LayoutGrid, Archive, MoreHorizontal } from "lucide-react"
import { getBoards, createBoard, updateBoard, deleteBoard } from '@/lib/actions/tasks'
import type { TaskBoard } from '@/lib/actions/tasks'
import Link from 'next/link'
import { toast } from "sonner"

export function TaskBoardsPage() {
    const [boards, setBoards] = useState<TaskBoard[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [creating, setCreating] = useState(false)

    useEffect(() => { loadBoards() }, [])

    const loadBoards = async () => {
        setLoading(true)
        const result = await getBoards()
        if (result.success && 'boards' in result) setBoards(result.boards)
        setLoading(false)
    }

    const handleCreate = async () => {
        if (!newTitle.trim()) return
        setCreating(true)
        const result = await createBoard(newTitle.trim(), newDesc.trim() || undefined)
        if (result.success) {
            toast.success('Tablica utworzona')
            setNewTitle('')
            setNewDesc('')
            setShowCreate(false)
            await loadBoards()
        } else {
            toast.error('error' in result ? result.error : 'Błąd')
        }
        setCreating(false)
    }

    const handleArchive = async (boardId: string) => {
        const result = await updateBoard(boardId, { archived: true })
        if (result.success) {
            toast.success('Tablica zarchiwizowana')
            await loadBoards()
        }
    }

    const handleDelete = async (boardId: string) => {
        if (!confirm('Na pewno usunąć tablicę i wszystkie zadania?')) return
        const result = await deleteBoard(boardId)
        if (result.success) {
            toast.success('Tablica usunięta')
            await loadBoards()
        }
    }

    return (
        <div className="space-y-6 p-6 md:p-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Tablice zadań</h1>
                    <p className="text-muted-foreground mt-1">Zarządzaj projektami i zadaniami zespołu</p>
                </div>
                <Button onClick={() => setShowCreate(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Nowa tablica
                </Button>
            </div>

            {showCreate && (
                <Card className="bg-card/80 border-primary/20">
                    <CardContent className="p-4 space-y-3">
                        <input
                            type="text"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            placeholder="Nazwa tablicy..."
                            className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                        />
                        <input
                            type="text"
                            value={newDesc}
                            onChange={e => setNewDesc(e.target.value)}
                            placeholder="Opis (opcjonalnie)..."
                            className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                        />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={handleCreate} disabled={creating || !newTitle.trim()}>
                                {creating ? 'Tworzenie...' : 'Utwórz'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewTitle(''); setNewDesc('') }}>
                                Anuluj
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <Card key={i} className="bg-card/50 border-white/5 animate-pulse">
                            <CardContent className="p-6 h-32" />
                        </Card>
                    ))}
                </div>
            ) : boards.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <LayoutGrid className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">Brak tablic</h3>
                        <p className="text-sm text-muted-foreground mt-2 max-w-md">
                            Utwórz pierwszą tablicę, aby zacząć zarządzać zadaniami.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {boards.map(board => (
                        <Link key={board.id} href={`/admin/tasks/${board.id}`}>
                            <Card className="bg-card/50 border-white/10 hover:border-primary/30 transition-all group cursor-pointer h-full">
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base group-hover:text-primary transition-colors">
                                            {board.title}
                                        </CardTitle>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => { e.preventDefault(); handleArchive(board.id) }}
                                                className="p-1 rounded hover:bg-white/10"
                                            >
                                                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                                            </button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    {board.description && (
                                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{board.description}</p>
                                    )}
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        <Badge variant="outline" className="text-[10px]">
                                            {board.visibility === 'team' ? 'Zespół' : board.visibility === 'private' ? 'Prywatna' : 'Publiczna'}
                                        </Badge>
                                        <span>Utworzono: {new Date(board.created_at).toLocaleDateString('pl-PL')}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
