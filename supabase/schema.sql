-- Optional GHOSTLINE workspace sync schema for Supabase.
-- Run this through the Supabase SQL editor or a database migration before
-- configuring the frontend environment variables.
create table if not exists public.ghostline_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  workspace jsonb not null,
  updated_at timestamptz not null default now(),
  constraint ghostline_workspace_object check (jsonb_typeof(workspace) = 'object')
);

alter table public.ghostline_workspaces enable row level security;

drop policy if exists "Riders can read their GHOSTLINE workspace" on public.ghostline_workspaces;
create policy "Riders can read their GHOSTLINE workspace"
  on public.ghostline_workspaces for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Riders can create their GHOSTLINE workspace" on public.ghostline_workspaces;
create policy "Riders can create their GHOSTLINE workspace"
  on public.ghostline_workspaces for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Riders can update their GHOSTLINE workspace" on public.ghostline_workspaces;
create policy "Riders can update their GHOSTLINE workspace"
  on public.ghostline_workspaces for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.ghostline_workspaces to authenticated;

-- Video setup data follows the authenticated rider; clips are private objects
-- and are addressed through short-lived signed URLs in the client.
create table if not exists public.ghostline_video_projects (
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id text not null,
  project jsonb not null,
  storage_path text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, run_id),
  constraint ghostline_video_project_object check (jsonb_typeof(project) = 'object')
);

alter table public.ghostline_video_projects enable row level security;
drop policy if exists "Riders can read their GHOSTLINE video projects" on public.ghostline_video_projects;
create policy "Riders can read their GHOSTLINE video projects"
  on public.ghostline_video_projects for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Riders can write their GHOSTLINE video projects" on public.ghostline_video_projects;
create policy "Riders can write their GHOSTLINE video projects"
  on public.ghostline_video_projects for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Riders can update their GHOSTLINE video projects" on public.ghostline_video_projects;
create policy "Riders can update their GHOSTLINE video projects"
  on public.ghostline_video_projects for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update on public.ghostline_video_projects to authenticated;

-- Unlisted run links use a random 256-bit bearer token. Only its SHA-256 digest
-- is stored; public viewers can read a snapshot only through the expiry-aware
-- RPC below, never by querying the table.
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.ghostline_shared_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  snapshot jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint ghostline_shared_run_object check (jsonb_typeof(snapshot) = 'object')
);

alter table public.ghostline_shared_runs enable row level security;
drop policy if exists "Riders can view their GHOSTLINE shares" on public.ghostline_shared_runs;
create policy "Riders can view their GHOSTLINE shares"
  on public.ghostline_shared_runs for select to authenticated
  using ((select auth.uid()) = owner_id);
drop policy if exists "Riders can create their GHOSTLINE shares" on public.ghostline_shared_runs;
create policy "Riders can create their GHOSTLINE shares"
  on public.ghostline_shared_runs for insert to authenticated
  with check ((select auth.uid()) = owner_id);
drop policy if exists "Riders can revoke their GHOSTLINE shares" on public.ghostline_shared_runs;
create policy "Riders can revoke their GHOSTLINE shares"
  on public.ghostline_shared_runs for delete to authenticated
  using ((select auth.uid()) = owner_id);
grant select, insert, delete on public.ghostline_shared_runs to authenticated;

create or replace function public.get_ghostline_shared_run(share_token text)
returns jsonb
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select snapshot
  from public.ghostline_shared_runs
  where token_hash = encode(extensions.digest(share_token, 'sha256'), 'hex')
    and expires_at > now()
  limit 1;
$$;
revoke all on function public.get_ghostline_shared_run(text) from public;
grant execute on function public.get_ghostline_shared_run(text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ghostline-videos', 'ghostline-videos', false, 262144000,
        array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Riders can read their GHOSTLINE videos" on storage.objects;
create policy "Riders can read their GHOSTLINE videos"
  on storage.objects for select to authenticated
  using (bucket_id = 'ghostline-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Riders can upload their GHOSTLINE videos" on storage.objects;
create policy "Riders can upload their GHOSTLINE videos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ghostline-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
