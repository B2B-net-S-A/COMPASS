-- COMMUNICATOR TABLES (M10)
-- 1. Create conversations table
create table if not exists public.conversations (
    id uuid not null default gen_random_uuid(),
    type text not null check (type in ('direct', 'broadcast')),
    name text,
    -- Required for broadcast
    owner_id uuid references public.profiles(id),
    -- Required for broadcast
    last_message_at timestamptz default now(),
    created_at timestamptz default now(),
    constraint conversations_pkey primary key (id)
);
-- 2. Create participants table
create table if not exists public.conversation_participants (
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    role text not null default 'member' check (role in ('owner', 'member', 'admin')),
    last_read_at timestamptz default now(),
    joined_at timestamptz default now(),
    constraint conversation_participants_pkey primary key (conversation_id, user_id)
);
-- 3. Create messages table
create table if not exists public.messages (
    id uuid not null default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    sender_id uuid not null references public.profiles(id),
    content text,
    attachment_url text,
    type text default 'text' check (type in ('text', 'image', 'file', 'system')),
    created_at timestamptz default now(),
    constraint messages_pkey primary key (id)
);
-- 4. Enable RLS
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
-- 5. RLS Policies
-- Conversations: Visible if you are a participant
create policy "Users can view conversations they are part of" on public.conversations for
select using (
        exists (
            select 1
            from public.conversation_participants
            where conversation_id = conversations.id
                and user_id = auth.uid()
        )
    );
-- Participants: Visible if you are in the same conversation (BUT RESTRICTED FOR BROADCAST)
-- For 'direct': Visible
-- For 'broadcast': Only owner/admin can see participants list. Members can only see themselves and owner.
create policy "View participants" on public.conversation_participants for
select using (
        -- If I am looking at my own record
        user_id = auth.uid()
        OR -- OR if I am the owner/admin of the conversation
        exists (
            select 1
            from public.conversation_participants as my_cp
                join public.conversations as c on c.id = my_cp.conversation_id
            where my_cp.user_id = auth.uid()
                and my_cp.conversation_id = conversation_participants.conversation_id
                and (
                    my_cp.role in ('owner', 'admin')
                    OR c.type = 'direct'
                )
        )
    );
-- Messages: Visible if you are a participant of the conversation
create policy "Users can view messages in their conversations" on public.messages for
select using (
        exists (
            select 1
            from public.conversation_participants
            where conversation_id = messages.conversation_id
                and user_id = auth.uid()
        )
    );
-- Sending Messages:
-- Direct: Must be a participant
-- Broadcast: Must be owner or admin
create policy "Users can send messages" on public.messages for
insert with check (
        exists (
            select 1
            from public.conversation_participants cp
                join public.conversations c on c.id = cp.conversation_id
            where cp.conversation_id = messages.conversation_id
                and cp.user_id = auth.uid()
                and (
                    (c.type = 'direct')
                    OR (
                        c.type = 'broadcast'
                        and cp.role in ('owner', 'admin')
                    )
                )
        )
    );
-- 6. Enable Realtime
alter publication supabase_realtime
add table public.messages;