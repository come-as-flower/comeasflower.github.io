-- 꽃 아카이브: Supabase SQL Editor에서 먼저 실행하세요.
-- 공개 읽기 + 관리자만 쓰기. service_role key를 브라우저에 넣지 마세요.
create extension if not exists pgcrypto;

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
create policy "Admins can read own membership" on public.site_admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_site_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.site_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_site_admin() from public;
-- 익명 사용자에 대해서는 false를 반환; 공개 조회 정책에서도 안전하게 호출 가능
grant execute on function public.is_site_admin() to anon, authenticated;

create table if not exists public.generations (
  id integer primary key check (id > 0),
  label text not null,
  started_year integer check (started_year is null or started_year between 2000 and 2200),
  activity_years smallint not null default 2 check (activity_years > 0 and activity_years <= 4),
  sort_order integer not null default 0
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  generation_id integer not null references public.generations(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  duration_text text not null default '',
  start_date date,
  end_date date,
  project_type text not null default '',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_generation_idx on public.projects(generation_id,sort_order);

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists works_project_idx on public.works(project_id,sort_order);

create table if not exists public.work_images (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  provider text not null check (provider in ('local','google_drive','supabase','r2')),
  path text not null check (length(trim(path)) > 0),
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists work_images_work_idx on public.work_images(work_id,sort_order);

create table if not exists public.exhibitions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  title text not null check (length(trim(title)) > 0),
  description jsonb not null default '[]'::jsonb check (jsonb_typeof(description)='array'),
  duration_text text not null default '',
  start_date date,
  end_date date,
  place text not null default '',
  cover_provider text check (cover_provider in ('local','google_drive','supabase','r2')),
  cover_path text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

-- 기존 schema.sql을 실행한 DB에는 이 마이그레이션만 추가 실행하세요.
create table if not exists public.exhibition_images (
  id uuid primary key default gen_random_uuid(),
  exhibition_id uuid not null references public.exhibitions(id) on delete cascade,
  provider text not null check (provider in ('local','google_drive','supabase','r2')),
  path text not null check (length(trim(path)) > 0),
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists exhibition_images_exhibition_idx on public.exhibition_images(exhibition_id,sort_order);
alter table public.exhibition_images enable row level security;
create policy "View public exhibition images or all as admin" on public.exhibition_images
  for select to anon,authenticated
  using ((exists(select 1 from public.exhibitions e where e.id=exhibition_id and e.published)) or (select public.is_site_admin()));
create policy "Manage exhibition images" on public.exhibition_images
  for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));

create table if not exists public.exhibition_projects (
  exhibition_id uuid not null references public.exhibitions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  primary key(exhibition_id, project_id)
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  generation_id integer not null references public.generations(id) on delete restrict,
  name text not null,
  contact text not null default '',
  is_active boolean not null default false,
  sort_order integer not null default 0,
  published boolean not null default true
);
create index if not exists members_generation_idx on public.members(generation_id, sort_order);

-- 작업/전시 참여자와 작업물 제작자는 멤버를 직접 연결합니다.
-- 한 사람이 여러 작업/작업물/전시에 참여할 수 있고, 공동 제작도 기록할 수 있습니다.
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  primary key(project_id, member_id)
);
create index if not exists project_members_member_idx on public.project_members(member_id);

create table if not exists public.work_members (
  work_id uuid not null references public.works(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  primary key(work_id, member_id)
);
create index if not exists work_members_member_idx on public.work_members(member_id);

create table if not exists public.exhibition_members (
  exhibition_id uuid not null references public.exhibitions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  primary key(exhibition_id, member_id)
);
create index if not exists exhibition_members_member_idx on public.exhibition_members(member_id);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  date_text text not null default '',
  contents jsonb not null default '[]'::jsonb check (jsonb_typeof(contents)='array'),
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS: 공개 자료만 익명 조회. 숨긴 프로젝트의 작품/이미지 역시 노출하지 않음.
alter table public.generations enable row level security;
alter table public.projects enable row level security;
alter table public.works enable row level security;
alter table public.work_images enable row level security;
alter table public.project_members enable row level security;
alter table public.work_members enable row level security;
alter table public.exhibitions enable row level security;
alter table public.exhibition_projects enable row level security;
alter table public.exhibition_members enable row level security;
alter table public.members enable row level security;
alter table public.notices enable row level security;

create policy "View generations" on public.generations for select to anon, authenticated using (true);
create policy "View public projects or all as admin" on public.projects for select to anon,authenticated
  using (published or (select public.is_site_admin()));
create policy "View public works or all as admin" on public.works for select to anon,authenticated
  using ((published and exists (select 1 from public.projects p where p.id = project_id and p.published)) or (select public.is_site_admin()));
create policy "View public images or all as admin" on public.work_images for select to anon,authenticated
  using ((exists (select 1 from public.works w join public.projects p on p.id=w.project_id where w.id=work_id and w.published and p.published)) or (select public.is_site_admin()));
create policy "View public project members or all as admin" on public.project_members for select to anon,authenticated
  using ((exists(select 1 from public.projects p where p.id=project_id and p.published)) or (select public.is_site_admin()));
create policy "View public work members or all as admin" on public.work_members for select to anon,authenticated
  using ((exists(select 1 from public.works w join public.projects p on p.id=w.project_id where w.id=work_id and w.published and p.published)) or (select public.is_site_admin()));
create policy "View exhibitions" on public.exhibitions for select to anon,authenticated using (published or (select public.is_site_admin()));
create policy "View exhibition project links" on public.exhibition_projects for select to anon,authenticated
  using ((exists(select 1 from public.exhibitions e where e.id=exhibition_id and e.published)
    and exists(select 1 from public.projects p where p.id=project_id and p.published)) or (select public.is_site_admin()));
create policy "View exhibition members or all as admin" on public.exhibition_members for select to anon,authenticated
  using ((exists(select 1 from public.exhibitions e where e.id=exhibition_id and e.published)) or (select public.is_site_admin()));
create policy "View members" on public.members for select to anon,authenticated using (published or (select public.is_site_admin()));
create policy "View notices" on public.notices for select to anon,authenticated using (published or (select public.is_site_admin()));

create policy "Manage generations" on public.generations for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage projects" on public.projects for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage works" on public.works for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage images" on public.work_images for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage project members" on public.project_members for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage work members" on public.work_members for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage exhibitions" on public.exhibitions for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage exhibition project links" on public.exhibition_projects for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage exhibition members" on public.exhibition_members for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage members" on public.members for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage notices" on public.notices for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));

-- public-read 버킷. 브라우저에서 파일을 올리는 건 반드시 로그인 + admin이어야 함.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flower-media','flower-media',true,10485760,array['image/jpeg','image/png','image/webp','image/avif','image/gif'])
on conflict (id) do nothing;
create policy "Admin upload flower images" on storage.objects for insert to authenticated
  with check (bucket_id='flower-media' and (select public.is_site_admin()));
create policy "Admin update flower images" on storage.objects for update to authenticated
  using (bucket_id='flower-media' and (select public.is_site_admin()))
  with check (bucket_id='flower-media' and (select public.is_site_admin()));
create policy "Admin delete flower images" on storage.objects for delete to authenticated
  using (bucket_id='flower-media' and (select public.is_site_admin()));

-- 계정 생성 뒤 별도로 실행: insert into public.site_admins(user_id) values ('AUTH-USER-UUID');
