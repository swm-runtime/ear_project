-- 0023 (2026-09-23, 자동화 도입 — spec/03 6.1 2단계 · spec/07 1장 개정):
--   군집화까지는 사람+Claude, 그 뒤 후보 승인 → 초안 → QA → 비평 → TTS → 썸네일 → 패키지까지 워커가 자동으로 잇는다.
--   추천 메타(enrich)·검수·발행은 사람. 스위치는 settings.automation (콘솔 설정 화면).
insert into public.settings (key, value) values
('automation', '{"auto_approve": true, "auto_publish_prep": true, "rule": "v1"}')
on conflict (key) do nothing;

-- 자동 승인 기록 — runs.phase 'approve' (approved_by = 'auto:v1' 와 함께 증거가 된다)
alter table public.runs drop constraint if exists runs_phase_check;
alter table public.runs add constraint runs_phase_check
  check (phase in ('sweep','cluster','draft','critic','qa','package','tts','domain_check','thumbnail','enrich','script_align','approve'));

-- 집기 우선순위 (2026-09-23 박수헌): 승인 순서(FIFO)대로 집으면 A 초안 → B 초안 → C 초안 → A QA … 로 갈라져 한 편이
-- 끝나기까지 너무 오래 걸린다. 진행 중인 에피소드의 후속 작업(payload 에 episode_id 가 있는 것 — QA·비평·개정 초안·TTS·썸네일·패키지)을
-- 먼저 집고, 사람이 건 작업(스윕·군집화·도메인 판정 등)이 그 다음, 새 초안(episode_id 없는 draft)은 마지막이다.
-- 워커가 하나면 한 편이 승인부터 패키지까지 온전히 끝난 뒤에야 다음 편의 초안이 시작된다.
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
     and (p_can_tts or type not in ('tts','script_align'))
     and (p_can_thumbnail or type <> 'thumbnail')
   order by
     case when payload ? 'episode_id' then 0      -- 진행 중인 에피소드의 후속 (한 편을 끝까지)
          when type = 'draft' then 2              -- 새 초안은 마지막
          else 1 end,                             -- 사람이 건 작업 (스윕·군집화·도메인 판정·소급 메타)
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
