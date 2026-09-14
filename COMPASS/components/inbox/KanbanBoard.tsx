'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { toast } from 'sonner'
import { KanbanCard } from './KanbanCard'
import { moveInboxTicket } from '@/lib/actions/support-inbox'
import { useRealtimeInboxTickets } from '@/lib/hooks/useRealtimeInboxTickets'
import { type InboxTicketWithMeta, type TicketStatus } from '@/lib/types/support'

import { INBOX_STATUS_LABELS, STATUS_HELP } from '@/lib/inbox/workspace'

const COLUMN_BG: Record<TicketStatus, string> = {
    open: 'bg-success/5 border-success/20',
    in_progress: 'bg-info/5 border-info/20',
    waiting_user: 'bg-warning/5 border-warning/20',
    resolved: 'bg-info/5 border-info/20',
    closed: 'bg-card border-border',
}

interface KanbanBoardProps {
    initialColumns: Record<TicketStatus, InboxTicketWithMeta[]>
    columnOrder?: TicketStatus[]
    onOpenTicket?: (id: string) => void
    now?: Date
}

export function KanbanBoard({ initialColumns, columnOrder = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'], onOpenTicket, now }: KanbanBoardProps) {
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
        if (source.droppableId === destination.droppableId) return

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
                {columnOrder.map((status) => {
                    const items = columns[status] ?? []
                    return (
                        <div
                            key={status}
                            className="space-y-2 flex-shrink-0 w-[280px] md:w-[260px] md:flex-1 md:min-w-[240px] snap-start"
                        >
                            <div className="flex items-center justify-between gap-2 px-1">
                                <h3 title={STATUS_HELP[status]} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                                    {INBOX_STATUS_LABELS[status]}
                                </h3>
                                <span className="text-[10px] text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted flex-shrink-0">
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
                                                Brak spraw
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
                                                            onOpenTicket={onOpenTicket}
                                                            now={now}
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
