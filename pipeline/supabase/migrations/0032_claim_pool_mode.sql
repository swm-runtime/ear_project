-- 0032 (2026-10-21): 소스 풀 채우기 — sweep 모드 P 는 웹 검색 실행기만 집는다 (0025 의 B·B2 와 같은 게이트). 함수 본문은 0025·0024 의 claim_job 그대로이고 모드 목록만 는다.
-- 되돌리기: 아래 함수의 in ('B','B2','P') 를 in ('B','B2') 로 되돌려 다시 만든다.

create or replace function public.claim_job(
  p_worker text,
  p_can_ai boolean,
  p_can_tts boolean default true,
  p_can_thumbnail boolean default true,
  p_exclude_types text[] default '{}',
  p_can_tools boolean default true
)
returns setof public.jobs
language plpgsql
as $$
declare
  j public.jobs;
begin
  update public.jobs
     set status = 'queued', claimed_by = null, claimed_at = null, heartbeat_at = null,
         error = coalesce(error, '') || ' | heartbeat 끊김으로 회수 ' || now()::text
   where status in ('claimed','running')
     and heartbeat_at < now() - interval '15 minutes';

  select * into j
    from public.jobs
   where status = 'queued'
     and (p_can_ai or requires_ai = false)
     and (p_can_tts or type not in ('tts','script_align'))
     and (p_can_thumbnail or type <> 'thumbnail')
     and not (type = any(p_exclude_types))
     and (p_can_tools or not (type = 'sweep' and coalesce(payload->>'mode', '') in ('B','B2','P')))   -- 0032: P 소스 풀 채우기
   order by
     case when payload ? 'episode_id' then 0
          when type = 'draft' then 2
          else 1 end,
     created_at
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update public.jobs
     set status = 'claimed', claimed_by = p_worker, claimed_at = now(), heartbeat_at = now()
   where id = j.id
  returning * into j;

  return next j;
end;
$$;
