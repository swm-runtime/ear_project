-- 0025 (2026-09-26): claim_job 에 p_can_tools — 도구(WebSearch)가 필요한 sweep 모드 B-①(보강)·B-②(주제 기획)은 도구를 쓸 수 있는 워커(Claude CLI, 노트북)만 집는다.
-- API 실행기(서버, 단발 호출만)는 집었다가 실패시키므로 아예 걸러 낸다 (박수헌: "새 모드는 서버가 아니라 로컬 Claude 가 처리").
drop function if exists public.claim_job(text, boolean, boolean, boolean, text[]);
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
     and (p_can_tools or not (type = 'sweep' and coalesce(payload->>'mode', '') in ('B','B2')))
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
