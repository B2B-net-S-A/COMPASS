'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { toast } from 'sonner'
import { KanbanCard } from './KanbanCard'
import { moveInboxTicket } from '@/lib/actions/support-inbox'
import { useRealtimeInboxTickets } from '@/lib/hooks/useRealtimeInboxTickets'
import { TICKET_STATUS_LABEL, type InboxTicketWithMeta, type TicketStatus } from '@/lib/types/support'

const COLUMN_ORDER: TicketStatus[] = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed']

const COLUMN_BG: Record<TicketStatus, string> = {
    open: 'bg-emerald-500/5 border-emerald-500/20',
    in_progress: 'bg-blue-500/5 border-blue-500/20',
    waiting_user: 'bg-amber-500/5 border-amber-500/20',
    resolved: 'bg-cyan-500/5 border-cyan-500/20',
    closed: 'bg-white/5 border-white/10',
}

interface KanbanBoardProps {
    initialColumns: Record<TicketStatus, InboxTicketWithMeta[]>
}

export function KanbanBoard({ initialColumns }: KanbanBoardProps) {
    const router = useRouter()
    const [columns, setColumns] = useState(initialColumns)
    const [, startTransition] = useTransition()

    // Sync columns when server passes new initialColumns (after revalidate / realtime).
    useEffect(() => {
        setColumns(initialColumns)
    }, [initialColumns])

    useRealtimeInboxTickets({ onChange: () => router.refresh() })

    const handleDragEnd = (result: DropResult) => {
        const { source, destination, draggableId } = result
        if (!destination) return
        if (source.droppableId === destination.droppableId && source.index === destination.index) return

        const fromStatus = source.droppableId as TicketStatus
        const toStatus = destination.droppableId as TicketStatus

        const snapshot = columns
        const ticket = columns[fromStatus][source.index]
        if (!ticket) return

        const fromList = [...columns[fromStatus]]
        fromList.splice(source.index, 1)
        const toList = [...columns[toStatus]]
        toList.splice(destination.index, 0, { ...ticket, status: toStatus })

        setColumns({ ...columns, [fromStatus]: fromList, [toStatus]: toList })

        startTransition(async () => {
            const res = await moveInboxTicket(draggableId, toStatus)
            if (!res.success) {
                setColumns(snapshot)
                toast.error(res.error)
                return
            }
            router.refresh()
        })
    }

    return (
        <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 snap-x snap-mandatory md:snap-none">
                {COLUMN_ORDER.map((status) => {
                    const items = columns[status] ?? []
                    return (
                        <div
                            key={status}
                            className="space-y-2 flex-shrink-0 w-[280px] md:w-[260px] md:flex-1 md:min-w-[240px] snap-start"
                        >
                            <div className="flex items-center justify-between gap-2 px-1">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                                    {TICKET_STATUS_LABEL[status]}
                                </h3>
                                <span className="text-[10px] text-muted-foreground/70 px-1.5 py-0.5 rounded bg-white/5 flex-shrink-0">
                                    {items.length}
                                </span>
                            </div>
                            <Droppable droppableId={status}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`rounded-lg border p-2 min-h-[400px] space-y-2 transition-colors ${
                                            COLUMN_BG[status]
                                        } ${snapshot.isDraggingOver ? 'border-primary/60 bg-primary/5' : ''}`}
                                    >
                                        {items.length === 0 && (
                                            <div className="text-[11px] text-muted-foreground/50 text-center py-6">
                                                Brak zgłoszeń
                                            </div>
                                        )}
                                        {items.map((ticket, idx) => (
                                            <Draggable key={ticket.id} draggableId={ticket.id} index={idx}>
                                                {(p, dragSnapshot) => (
                                                    <div
                                                        ref={p.innerRef}
                                                        {...p.draggableProps}
                                                        {...p.dragHandleProps}
                                                    >
                                                        <KanbanCard
                                                            ticket={ticket}
                                                            isDragging={dragSnapshot.isDragging}
                                                        />
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    )
                })}
            </div>
        </DragDropContext>
    )
}
