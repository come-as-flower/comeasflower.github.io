-- CMS 데이터 구조 2차 정리
-- 실행 전 Supabase Database 백업을 만들고, 이 파일은 한 번만 실행하세요.
-- 기존 공개 URL, 기존 썸네일, creator/participants 값은 호환·검증 기간 동안 삭제하지 않습니다.

alter table public.generations
  add column if not exists started_year integer check (started_year is null or started_year between 2000 and 2200),
  add column if not exists activity_years smallint not null default 2 check (activity_years > 0 and activity_years <= 4);

alter table public.projects
  add column if not exists project_type text not null default '';
update public.projects set project_type=output where project_type='' and coalesce(output,'')<>'';

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

-- 기존 작품의 creator 텍스트가 현재 멤버 이름과 정확히 일치할 때만 제작자/프로젝트 참여자로 옮깁니다.
-- 동명이인은 프로젝트 기수와 같은 멤버를 우선하며, 확인하지 못한 이름은 기존 creator 열에 보존됩니다.
insert into public.work_members(work_id,member_id)
select w.id, matched.id
from public.works w
join public.projects p on p.id=w.project_id
join lateral (
  select m.id from public.members m
  where lower(trim(m.name))=lower(trim(w.creator)) and trim(w.creator)<>''
  order by (m.generation_id=p.generation_id) desc, m.generation_id desc, m.sort_order asc
  limit 1
) matched on true
on conflict do nothing;

insert into public.project_members(project_id,member_id)
select w.project_id,wm.member_id
from public.works w join public.work_members wm on wm.work_id=w.id
on conflict do nothing;

-- 기존 꽃밤 participants 배열도 멤버 이름과 정확히 일치할 때만 옮깁니다.
insert into public.exhibition_members(exhibition_id,member_id)
select e.id, matched.id
from public.exhibitions e
cross join lateral jsonb_array_elements_text(coalesce(e.participants,'[]'::jsonb)) as participant(name)
join lateral (
  select m.id from public.members m
  where lower(trim(m.name))=lower(trim(participant.name))
  order by m.generation_id desc, m.sort_order asc
  limit 1
) matched on true
on conflict do nothing;

alter table public.project_members enable row level security;
alter table public.work_members enable row level security;
alter table public.exhibition_members enable row level security;

create policy "View public project members or all as admin" on public.project_members for select to anon,authenticated
  using ((exists(select 1 from public.projects p where p.id=project_id and p.published)) or (select public.is_site_admin()));
create policy "View public work members or all as admin" on public.work_members for select to anon,authenticated
  using ((exists(select 1 from public.works w join public.projects p on p.id=w.project_id where w.id=work_id and w.published and p.published)) or (select public.is_site_admin()));
create policy "View exhibition members or all as admin" on public.exhibition_members for select to anon,authenticated
  using ((exists(select 1 from public.exhibitions e where e.id=exhibition_id and e.published)) or (select public.is_site_admin()));

create policy "Manage project members" on public.project_members for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage work members" on public.work_members for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));
create policy "Manage exhibition members" on public.exhibition_members for all to authenticated using ((select public.is_site_admin())) with check ((select public.is_site_admin()));

-- 다음 열은 아직 삭제하지 않습니다. 새 관리자에서는 사용하지 않으며, 데이터 확인이 끝난 뒤 별도 migration에서 제거하세요.
-- public.projects.cover_provider, public.projects.cover_path, public.projects.output
-- public.works.creator, public.exhibitions.participants, public.generations.year
