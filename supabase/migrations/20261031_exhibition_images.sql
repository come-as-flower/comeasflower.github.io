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
