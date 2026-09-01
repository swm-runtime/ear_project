# pipeline 작업 규칙

'이어' 콘텐츠 파이프라인 실행체(Next.js 웹 UI + Node 워커 + Supabase). 이 파일은 **무엇을 보고 어디까지 고칠 수 있는지**를 정한다.

## 1. 수정 범위

- 수정할 수 있는 것은 `pipeline/` 안의 코드와 `docs/ai/` 안의 명세·프롬프트 자산이다. `backend/`·`frontend/`·`ai-server/`·저장소 루트 공용 설정은 읽기만 한다 — 고쳐야 하면 해당 파트 담당에게 전달한다.
- `docs/ai/`는 이 파트의 기준 문서이자 **워커가 실행 중에 읽는 프롬프트 자산**이다. 규칙(`skills/draft/guidelines.md`)을 고치면 루브릭·골드·QA 프롬프트·`packages/pipeline`의 생성 프롬프트·CHANGELOG를 같이 고친다(spec/09 4.3). 버전(`full-vN`·`critic-vN`·`qa-vN`)을 올리지 않은 규칙 변경은 없다.

## 2. 기준 문서

| 작업 | 문서 |
|---|---|
| 큐·연쇄·화면·워커 역할 | `docs/ai/spec/10-webapp.md` |
| 단계별 규칙(스윕·군집화·대본·QA·오디오·발행) | `docs/ai/spec/02~07` — 코드는 명세를 따르고, 어긋나면 문서부터 고친다 |
| 평가 체계·프롬프트 개정 절차 | `docs/ai/spec/09-quality-cycle.md` |
| 인프라·실행 계층·로컬 모델 전환 | `docs/ai/spec/08-infra.md` |
| DB 컬럼·enum | `pipeline/supabase/schema.sql` (+ `migrations/`) — 없는 컬럼을 코드에 만들지 않는다 |
| ai-server와의 경계 | spec/10 2장 "정렬" — 대본 생성·QA·비평은 이 워커의 실행기 몫, FastAPI 엔드포인트로 만들지 않는다 |

## 3. 절대 규칙

- **비밀은 커밋하지 않는다.** `.env*` 실값, Supabase 비밀번호·키, API 키. `.env.example`에도 실값을 적지 않는다.
- **제3자 전사본(`references/*.txt`)을 레포·프롬프트에 넣지 않는다.** 소스 원문은 `sources.md` 발췌(내부 증적)로만 남기고 재배포하지 않는다.
- **WORK_ROOT는 레포 밖이다.** `claude -p`의 cwd가 레포 안이면 루트 `CLAUDE.md`·`.claude/`가 생성 컨텍스트에 섞인다. 자산은 `--add-dir ASSET_ROOT`로만 연다.
- **사람 몫을 자동화하지 않는다** — 게이트 1 승인(`approved` 전환)·소스 풀 계층 판정·비평 판정·TTS 트리거는 UI에서 사람만. 워커는 `approved`를 감지해 집을 뿐 만들지 않는다.
- **QA 독립성** — QA·비평은 생성 맥락을 모른 채 새 프로세스에서 돈다. 프롬프트에 생성 리포트·다른 에피소드를 반입하지 않는다.
- 403·봇 차단·robots는 우회하지 않는다(불변 원칙 2). 풀 밖 도메인은 `WebFetch(domain:…)` 허용 목록에 넣지 않는다.

## 4. 개발 명령

```bash
cd pipeline && npm install
npm run dev -w apps/web                 # 웹 http://localhost:3000
npm run worker                          # 워커 (계속 폴링) · -- --once · -- --drain · -- --enqueue <type> '<json>'
npm run typecheck -w apps/worker        # 워커 타입 검사
npx tsc --noEmit -p apps/web            # 웹 타입 검사 · npm run build -w apps/web
```

## 5. 커밋·PR

- 커밋 `<type>(pipeline): <subject>` · 브랜치 `<type>(ai)/<kebab>` (`docs/backend/convention.md` 6장). 커밋·push는 사용자가 요청했을 때만.
- 스키마 변경은 `supabase/migrations/NNNN_*.sql` 추가 + `schema.sql` 스냅샷 갱신을 한 커밋에. 적용은 팀 Supabase에 수동이므로 PR 본문에 적용 여부를 적는다.
