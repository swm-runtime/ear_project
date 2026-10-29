-- 0041 (2026-10-30, KAN-296): 시리즈 단위 짧은 판 — 발행된 시리즈를 5~12분 편으로 다시 만든 시리즈.
-- 새 앱 배포 뒤 가입한 사용자에게는 짧은 판 시리즈만 나간다(BE KAN-298). 편마다 backlog.length_profile='short'·remake_of(0040)를 함께 단다.
alter table public.series add column if not exists length_profile text not null default 'standard' check (length_profile in ('standard', 'short'));
alter table public.series add column if not exists remake_of uuid references public.series(id);
create index if not exists series_remake_of_idx on public.series (remake_of) where remake_of is not null;
