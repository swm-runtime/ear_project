-- 0024 (2026-09-26): claim_job 에 제외 유형 인자 — 서버 워커 AI 집기 스위치(settings.automation.server_ai_claim=false)가 켜지면
-- 서버는 AI 작업뿐 아니라 스윕(io)도 집지 않는다. 스윕·군집화는 노트북 Claude 워커가 맡는다 (박수헌: "스윕, 군집화 다 로컬에서").
create or replace function public.claim_job(
  p_worker text,
  p_can_ai boolean,
  p_can_tts boolean default true,
  p_can_thumbnail boolean default true,
  p_exclude_types text[] default '{}'
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
