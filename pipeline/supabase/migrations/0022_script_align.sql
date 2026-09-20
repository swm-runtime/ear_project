-- 0022 (2026-09-20): 자막 세그먼트 소급 — 발행본 dist.mp3 + 대본을 강제 정렬(ElevenLabs Forced Alignment)해
-- episodes/<id>/script-segments.json 을 만드는 작업 유형 script_align (KAN-72 후속 · spec/06 7장).
-- 오디오를 다시 합성하지 않으므로 콘텐츠 버전이 오르지 않는다(script_file 단독 PATCH, admin-api 4.10). 반영은 콘솔이 브라우저 세션으로.
alter table public.jobs drop constraint if exists jobs_type_check;
alter table public.jobs add constraint jobs_type_check
  check (type in ('sweep','cluster','draft','qa','critic','tts','package','domain_check','thumbnail','critic_measure','enrich','script_align'));
alter table public.runs drop constraint if exists runs_phase_check;
alter table public.runs add constraint runs_phase_check
  check (phase in ('sweep','cluster','draft','critic','qa','package','tts','domain_check','thumbnail','enrich','script_align'));

-- claim_job: script_align 도 ElevenLabs 키가 있는 워커만 집는다 (tts 와 같은 게이트 — 서버 워커가 집는다)
create or replace function public.claim_job(
  p_worker text,
  p_can_ai boolean,
  p_can_tts boolean default true,
  p_can_thumbnail boolean default true
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
     and (p_can_tts or type not in ('tts','script_align'))   -- 키 없는 워커는 건너뛴다 (큐에 남겨 다른 워커가 집도록)
     and (p_can_thumbnail or type <> 'thumbnail')
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
