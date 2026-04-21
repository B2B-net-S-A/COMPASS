import { KanbanBoardPage } from '@/components/tasks/KanbanBoardPage'

interface PageProps {
    params: { id: string }
}

export default function BoardDetailPage({ params }: PageProps) {
    return <KanbanBoardPage boardId={params.id} />
}
