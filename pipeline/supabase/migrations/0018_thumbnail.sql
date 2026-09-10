-- 0018 (2026-09-10): 썸네일 생성 단계 — episodes.thumbnail_key · one_liner · thumbnail 작업/실행 종류.
-- 원본 티켓: docs/tickets/ai/pending/episode-publish-prep-chain.md (KAN-50)
--
-- 지금까지 썸네일은 파이프라인 밖에서 만들었다(운영자가 ChatGPT 웹에서 받아 업로드 화면에 업로드).
-- 워커 단계로 들여오면서 산출물 키와 프롬프트 슬롯 재료를 에피소드에 둔다.
--
-- **추가만 한다.** 컬럼 삭제·데이터 삭제 없음. check 제약은 기존 값을 모두 포함한 채 재생성한다.

-- 산출물 키 (s3:episodes/<id>/thumbnail.png). 기존 audio_*_key 와 같은 규칙
alter table public.episodes add column if not exists thumbnail_key text;

-- 한 줄 요약 (40자 이내) — 썸네일 프롬프트의 {핵심 개념} 슬롯이자 발행 메타의 설명 첫 줄.
-- 대본 작성 완료 보고에서 받는다(추가 모델 호출 없음). 구 에피소드는 null 이고 썸네일 단계가 설계 축으로 대체한다
alter table public.episodes add column if not exists one_liner text;

-- 작업 큐에 thumbnail 종류 추가 (spec/10 4장).
-- **domain_check 를 반드시 함께 적는다** — 0007·0008 이 넣은 값인데 schema.sql 스냅샷에는 빠져 있었다.
-- 목록에서 빼면 기존 13건이 제약을 위반해 마이그레이션이 통째로 실패한다(2026-09-10 실측 — 롤백됨).
alter table public.jobs drop constraint if exists jobs_type_check;
alter table public.jobs add constraint jobs_type_check
  check (type in ('sweep','cluster','draft','qa','critic','tts','package','domain_check','thumbnail'));

-- 실행 기록에 thumbnail phase 추가 — 모델·비용이 여기에 남는다(spec/08 3.1과 같은 계측)
alter table public.runs drop constraint if exists runs_phase_check;
alter table public.runs add constraint runs_phase_check
  check (phase in ('sweep','cluster','draft','critic','qa','package','tts','domain_check','thumbnail'));

-- claim_job 에 썸네일 집기 게이트 추가 — 0010(TTS)과 같은 이유다.
-- thumbnail 은 requires_ai=false 라 io 워커면 아무나 집을 수 있는데, OPENAI_API_KEY 는 서버 env.prod 에만
-- 있다. 키 없는 노트북 워커가 집으면 즉시 실패하고 큐에서 사라진다(0010 이 TTS 에서 실측한 문제).
-- p_can_thumbnail default true — 기존 3인자 호출은 이전과 동일하게 동작하고, 새 워커가 4인자로 자기 능력을 전달한다.
drop function if exists public.claim_job(text, boolean, boolean);

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
     and (p_can_tts or type <> 'tts')                 -- 키 없는 워커는 건너뛴다 (큐에 남겨 다른 워커가 집도록)
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
