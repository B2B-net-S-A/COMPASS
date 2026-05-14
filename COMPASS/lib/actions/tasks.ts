'use server'

import { createClient } from '@/lib/supabase/server'

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type TaskStatus = 'open' | 'in_progress' | 'review' | 'done' | 'blocked'

export interface TaskBoard {
    id: string
    title: string
    description: string | null
    owner_id: string | null
    visibility: 'private' | 'team' | 'public'
    archived: boolean
    created_at: string
    updated_at: string
}

export interface TaskColumn {
    id: string
    board_id: string
    title: string
    position: number
    color: string
    wip_limit: number | null
}

export interface Task {
    id: string
    board_id: string
    column_id: string
    title: string
    description: string | null
    priority: TaskPriority
    status: TaskStatus
    position: number
    due_date: string | null
    labels: string[]
    created_by: string | null
    updated_at: string
    created_at: string
    assignees?: { id: string; user_id: string; full_name: string; avatar_url: string | null }[]
    comments_count?: number
}

export interface TaskComment {
    id: string
    task_id: string
    author_id: string | null
    content: string
    parent_id: string | null
    created_at: string
    updated_at: string
    author_name?: string
    author_avatar?: string | null
}

async function requireAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Nie jesteś zalogowany')
    return { supabase, user }
}

// ============= BOARDS =============

export async function getBoards() {
    const { supabase } = await requireAuth()
    const { data, error } = await supabase
        .from('task_boards')
        .select('*')
        .eq('archived', false)
        .order('created_at', { ascending: false })

    if (error) return { success: false as const, error: error.message }
    return { success: true as const, boards: data as TaskBoard[] }
}

export async function createBoard(title: string, description?: string) {
    const { supabase, user } = await requireAuth()
    const { data, error } = await supabase
        .from('task_boards')
        .insert({ title, description: description || null, owner_id: user.id })
        .select()
        .single()

    if (error) return { success: false as const, error: error.message }

    const defaultColumns = [
        { board_id: data.id, title: 'Do zrobienia', position: 0, color: '#6B7280' },
        { board_id: data.id, title: 'W trakcie', position: 1, color: '#3B82F6' },
        { board_id: data.id, title: 'Przegląd', position: 2, color: '#F59E0B' },
        { board_id: data.id, title: 'Gotowe', position: 3, color: '#10B981' },
    ]

    await supabase.from('task_columns').insert(defaultColumns)

    return { success: true as const, board: data as TaskBoard }
}

export async function updateBoard(boardId: string, updates: Partial<Pick<TaskBoard, 'title' | 'description' | 'visibility' | 'archived'>>) {
    const { supabase } = await requireAuth()
    const { error } = await supabase
        .from('task_boards')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', boardId)

    if (error) return { success: false as const, error: error.message }
    return { success: true as const }
}

export async function deleteBoard(boardId: string) {
    const { supabase } = await requireAuth()
    const { error } = await supabase.from('task_boards').delete().eq('id', boardId)
    if (error) return { success: false as const, error: error.message }
    return { success: true as const }
}

// ============= COLUMNS =============

export async function getColumns(boardId: string) {
    const { supabase } = await requireAuth()
    const { data, error } = await supabase
        .from('task_columns')
        .select('*')
        .eq('board_id', boardId)
        .order('position')

    if (error) return { success: false as const, error: error.message }
    return { success: true as const, columns: data as TaskColumn[] }
}

export async function createColumn(boardId: string, title: string, color?: string) {
    const { supabase } = await requireAuth()

    const { data: existing } = await supabase
        .from('task_columns')
        .select('position')
        .eq('board_id', boardId)
        .order('position', { ascending: false })
        .limit(1)

    const nextPos = existing && existing.length > 0 ? existing[0].position + 1 : 0

    const { data, error } = await supabase
        .from('task_columns')
        .insert({ board_id: boardId, title, position: nextPos, color: color || '#3B82F6' })
        .select()
        .single()

    if (error) return { success: false as const, error: error.message }
    return { success: true as const, column: data as TaskColumn }
}

export async function updateColumn(columnId: string, updates: Partial<Pick<TaskColumn, 'title' | 'color' | 'wip_limit' | 'position'>>) {
    const { supabase } = await requireAuth()
    const { error } = await supabase.from('task_columns').update(updates).eq('id', columnId)
    if (error) return { success: false as const, error: error.message }
    return { success: true as const }
}

export async function deleteColumn(columnId: string) {
    const { supabase } = await requireAuth()
    const { error } = await supabase.from('task_columns').delete().eq('id', columnId)
    if (error) return { success: false as const, error: error.message }
    return { success: true as const }
}

export async function reorderColumns(boardId: string, columnIds: string[]) {
    const { supabase } = await requireAuth()
    const promises = columnIds.map((id, idx) =>
        supabase.from('task_columns').update({ position: idx }).eq('id', id).eq('board_id', boardId)
    )
    await Promise.all(promises)
    return { success: true as const }
}

// ============= TASKS =============

export async function getBoardTasks(boardId: string) {
    const { supabase } = await requireAuth()

    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('board_id', boardId)
        .order('position')

    if (error) return { success: false as const, error: error.message }

    const taskIds = (tasks || []).map(t => t.id)
    const assigneesMap: Record<string, any[]> = {}
    const commentsCountMap: Record<string, number> = {}

    if (taskIds.length > 0) {
        const { data: assignments } = await supabase
            .from('task_assignments')
            .select('task_id, user_id')
            .in('task_id', taskIds)

        if (assignments && assignments.length > 0) {
            const userIds = Array.from(new Set(assignments.map(a => a.user_id)))
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url')
                .in('id', userIds)

            const profileMap = new Map((profiles || []).map(p => [p.id, p]))

            assignments.forEach(a => {
                if (!assigneesMap[a.task_id]) assigneesMap[a.task_id] = []
                const profile = profileMap.get(a.user_id)
                assigneesMap[a.task_id].push({
                    id: a.task_id + '_' + a.user_id,
                    user_id: a.user_id,
                    full_name: profile?.full_name || 'Nieznany',
                    avatar_url: profile?.avatar_url || null,
                })
            })
        }

        const { data: comments } = await supabase
            .from('task_comments')
            .select('task_id')
            .in('task_id', taskIds)

        if (comments) {
            comments.forEach(c => {
                commentsCountMap[c.task_id] = (commentsCountMap[c.task_id] || 0) + 1
            })
        }
    }

    const enrichedTasks: Task[] = (tasks || []).map(t => ({
        ...t,
        assignees: assigneesMap[t.id] || [],
        comments_count: commentsCountMap[t.id] || 0,
    }))

    return { success: true as const, tasks: enrichedTasks }
}

export async function createTask(data: {
    board_id: string
    column_id: string
    title: string
    description?: string
    priority?: TaskPriority
    due_date?: string
    labels?: string[]
    assignee_ids?: string[]
}) {
    const { supabase, user } = await requireAuth()

    const { data: existing } = await supabase
        .from('tasks')
        .select('position')
        .eq('column_id', data.column_id)
        .order('position', { ascending: false })
        .limit(1)

    const nextPos = existing && existing.length > 0 ? existing[0].position + 1 : 0

    const { data: task, error } = await supabase
        .from('tasks')
        .insert({
            board_id: data.board_id,
            column_id: data.column_id,
            title: data.title,
            description: data.description || null,
            priority: data.priority || 'medium',
            due_date: data.due_date || null,
            labels: data.labels || [],
            position: nextPos,
            created_by: user.id,
        })
        .select()
        .single()

    if (error) return { success: false as const, error: error.message }

    if (data.assignee_ids && data.assignee_ids.length > 0) {
        await supabase.from('task_assignments').insert(
            data.assignee_ids.map(uid => ({ task_id: task.id, user_id: uid }))
        )
    }

    await supabase.from('task_activity').insert({
        task_id: task.id,
        actor_id: user.id,
        action: 'created',
        details: { title: data.title },
    })

    return { success: true as const, task: task as Task }
}

export async function updateTask(taskId: string, updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'status' | 'due_date' | 'labels'>>) {
    const { supabase, user } = await requireAuth()
    const { error } = await supabase
        .from('tasks')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', taskId)

    if (error) return { success: false as const, error: error.message }

    await supabase.from('task_activity').insert({
        task_id: taskId,
        actor_id: user.id,
        action: 'updated',
        details: updates,
    })

    return { success: true as const }
}

export async function moveTask(taskId: string, targetColumnId: string, targetPosition: number) {
    const { supabase, user } = await requireAuth()
    const { error } = await supabase
        .from('tasks')
        .update({
            column_id: targetColumnId,
            position: targetPosition,
            updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)

    if (error) return { success: false as const, error: error.message }

    await supabase.from('task_activity').insert({
        task_id: taskId,
        actor_id: user.id,
        action: 'moved',
        details: { column_id: targetColumnId, position: targetPosition },
    })

    return { success: true as const }
}

export async function deleteTask(taskId: string) {
    const { supabase } = await requireAuth()
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) return { success: false as const, error: error.message }
    return { success: true as const }
}

// ============= COMMENTS =============

export async function getTaskComments(taskId: string) {
    const { supabase } = await requireAuth()
    const { data, error } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at')

    if (error) return { success: false as const, error: error.message }

    const authorIds = Array.from(new Set((data || []).map(c => c.author_id).filter(Boolean)))
    const profileMap = new Map<string, any>()

    if (authorIds.length > 0) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', authorIds)

        if (profiles) {
            profiles.forEach(p => profileMap.set(p.id, p))
        }
    }

    const enriched: TaskComment[] = (data || []).map(c => ({
        ...c,
        author_name: c.author_id ? profileMap.get(c.author_id)?.full_name || 'Nieznany' : 'System',
        author_avatar: c.author_id ? profileMap.get(c.author_id)?.avatar_url : null,
    }))

    return { success: true as const, comments: enriched }
}

export async function addTaskComment(taskId: string, content: string, parentId?: string) {
    const { supabase, user } = await requireAuth()
    const { data, error } = await supabase
        .from('task_comments')
        .insert({
            task_id: taskId,
            author_id: user.id,
            content,
            parent_id: parentId || null,
        })
        .select()
        .single()

    if (error) return { success: false as const, error: error.message }

    await supabase.from('task_activity').insert({
        task_id: taskId,
        actor_id: user.id,
        action: 'commented',
        details: { comment_id: data.id },
    })

    return { success: true as const, comment: data as TaskComment }
}

// ============= ASSIGNMENTS =============

export async function assignTask(taskId: string, userId: string) {
    const { supabase, user } = await requireAuth()
    const { error } = await supabase
        .from('task_assignments')
        .upsert({ task_id: taskId, user_id: userId })

    if (error) return { success: false as const, error: error.message }

    await supabase.from('task_activity').insert({
        task_id: taskId,
        actor_id: user.id,
        action: 'assigned',
        details: { user_id: userId },
    })

    return { success: true as const }
}

export async function unassignTask(taskId: string, userId: string) {
    const { supabase } = await requireAuth()
    const { error } = await supabase
        .from('task_assignments')
        .delete()
        .eq('task_id', taskId)
        .eq('user_id', userId)

    if (error) return { success: false as const, error: error.message }
    return { success: true as const }
}

// ============= ACTIVITY =============

export async function getTaskActivity(taskId: string) {
    const { supabase } = await requireAuth()
    const { data, error } = await supabase
        .from('task_activity')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(50)

    if (error) return { success: false as const, error: error.message }
    return { success: true as const, activities: data }
}
