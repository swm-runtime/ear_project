-- 0010 (2026-09-03): claim_job 에 TTS 집기 게이트 추가.
-- TTS 는 requires_ai=false 라 io 워커면 아무나 집을 수 있었는데, ElevenLabs 키는 서버 env.prod 에만 있어
-- 키 없는 노트북 워커가 집으면 즉시 실패했다(2026-09-03 실측). "TTS 를 실행할 수 있는 워커만 집는다"로 바꾼다.
-- p_can_tts = 워커가 TTS 를 실행할 수 있는가(= ElevenLabs 키 보유). default true 로 두어 기존 2인자 호출도
-- 이전과 동일하게 동작(= TTS 집기 허용)하게 하고, 새 워커는 3인자로 자기 능력을 전달한다.

drop function if exists public.claim_job(text, boolean);

create or replace function public.claim_job(p_worker text, p_can_ai boolean, p_can_tts boolean default true)
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
     and (p_can_tts or type <> 'tts')   -- 키 없는 워커는 TTS 를 건너뛴다 (다른 워커가 집도록 큐에 남긴다)
   order by created_at
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
