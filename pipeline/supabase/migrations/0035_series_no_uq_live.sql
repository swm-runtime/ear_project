-- 0035 (2026-10-27): 시리즈 화 번호의 부분 유니크를 "살아 있는 후보"로 좁힌다.
-- 종전 backlog_series_no_uq (series_id, series_no) where series_id is not null 은 반려된 편 후보도 자리를 차지해
-- 콘솔 [이 편 다시 기획](spec/11 4장)·기획 작업 재시도가 같은 화 번호에 새 후보를 달지 못했다(duplicate key).
-- 반려(rejected)는 빼고 센다 — 한 화에 살아 있는 후보는 하나. 앞 편 조회·발행 편 목록도 반려를 뺀다(PR #2078).
drop index if exists public.backlog_series_no_uq;
create unique index if not exists backlog_series_no_uq on public.backlog (series_id, series_no) where series_id is not null and status <> 'rejected';
