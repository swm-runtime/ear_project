# 이어 (ear_project)

AI 생성 팟캐스트 서비스 '이어'의 저장소. 3인 팀, 백엔드는 NestJS + PostgreSQL, 프론트엔드는 React Native(Expo)로 개발한다. 앱 밖 파트로 AI 서버(`ai-server/`, FastAPI 단발 추론)와 콘텐츠 파이프라인(`pipeline/`, Next.js 웹 UI + Node 워커 + Supabase + 파이프라인 S3)이 있다 — 각 파트의 `README.md`·`CLAUDE.md`가 그 파트의 규칙이다.

> 이 문서는 **팀 공용**이다. 역할(FE/BE)별 지침·개인 설정은 각자 `CLAUDE.local.md`(gitignore 대상)에 둔다.

## 공통 원칙

- **자기 파트 코드만 수정한다.** 상대 파트의 코드·문서는 참조만 하고, 수정이 필요하면 해당 파트 담당에게 전달한다.
- **판정은 서버가 하고 클라이언트는 표시만 한다.** 재생 한도·만료·서비스 날짜(04시 경계) 판정을 클라이언트에서 하지 않는다. 티어명 하드코딩 금지, 기기 시각을 정책 판정에 사용 금지.
- **문서와 충돌하는 구현은 만들지 않는다.** 규칙이 틀렸다면 코드가 아니라 문서를 먼저 고친다.
- 커밋·푸시는 사용자가 명시적으로 요청했을 때만 수행한다.

## 문서 지도 — 어떤 상황에 어떤 문서를 보는가

```
prd/          무엇을·왜 만드는가 (FR-01~39)
  └─ features/         화면·기능별 동작 규칙의 소유자 (판정·상태 전이·예외)
       ├─ spec/api/       동작 규칙의 HTTP 계약 표현 (엔드포인트·DTO·에러 코드)
       ├─ spec/uiux/      동작 규칙의 화면 표현 (화면 ID·상태·카피·접근성)
       └─ wireframe/      화면 ID의 시각 참조 (HTML)
ai/           앱 밖 콘텐츠 제작 절차 (주제 발굴·대본·QA — 제품 기능이 아니라 운영 절차). 실행체는 `pipeline/`, 워커가 이 디렉토리를 프롬프트 자산으로 직접 읽는다
backend/      서버 구조·스키마·코드 규칙 (스키마의 유일한 기준)
frontend/     클라이언트 구조·코드 규칙
changes/      개발 중 발견한 문서 수정 사항의 기록 — 통합 과정에서 반영 (pending/ → archive/)
tickets/      통합 테스트 중 발견한 코드 수정 사항의 기록 — 테스트 종료 후 반영 (<파트>/pending/ → <파트>/archive/)
```

문서 간 규칙이 충돌하면 **동작 규칙은 `features/`가, 스키마는 `backend/domain.md`가, 통신 계약은 `spec/api/`가 기준**이다.

### 요청 문서 — `changes/`와 `tickets/`

수정 사항을 발견한 즉시 고치지 않고 **기록해두었다가 정해진 시점에 모아서 반영한다.** 고칠 대상이 문서면 `changes/`, 코드면 `tickets/<파트>/`다. 자기 파트·상대 파트 구분 없이 적용된다.

- **`changes/`** — **개발 중** 문서(`docs/`)에 수정할 상황이 생기면 바로 수정하지 않고 `changes/pending/<수정단위>.md`에 수정 내용과 사유를 기록만 해두고, **통합 과정에서** 모아서 반영한다.
- **`tickets/`** — **통합 후 테스트 과정에서** 코드에 수정할 사항이 생기면 `tickets/<파트>/pending/`에 먼저 기록해두고, **테스트가 다 끝난 뒤** 수정 사항을 한번에 반영한다. `<파트>`는 그 수정을 반영할 파트다.

- **끝난 요청은 `pending/`에서 `archive/`로 옮긴다.** `tickets/frontend/pending/` → `tickets/frontend/archive/`, `changes/pending/` → `changes/archive/`. 옮기지 않으면 `pending/`에 이미 처리된 항목이 쌓이고, 목록을 아무도 믿지 않게 된다.
- **티켓은 그 수정을 담은 PR에서 함께 옮긴다.** 나중에 몰아서 정리하지 않는다 — 문서 반영은 대상 문서를 열면 확인되지만, 티켓은 코드가 고쳐졌는지 따로 봐야 해서 미루면 아무도 판단할 수 없다.
- **모든 요청 문서에 "완료 조건"을 Given/When/Then으로 적는다**(`features/`의 완료 조건과 같은 형식). 옮길지 말지가 취향이 아니라 확인 가능한 판정이 된다.
- **발행 날짜와 반영 날짜를 문서 안에 기록한다.** 발행 시 상단 표에 **발행 날짜**를 적고, 처리를 마쳐 `archive/`로 옮길 때 **반영 날짜**를 덧붙인다(처리 기록 블록에). 날짜가 없으면 pending이 얼마나 묵었는지, archive가 언제 어느 통합에서 반영됐는지를 git 이력을 뒤져야만 알 수 있다.
- 반영하지 못하고 보류할 때는 **보류 사유와 남은 결정 항목을 문서 안에 덧붙인 뒤** `pending/`에 둔다. 다음에 집는 사람이 같은 조사를 반복하지 않게 한다.

`ls docs/tickets/<파트>/pending`이 곧 그 파트의 할 일 목록이다.

### 상황별 참조 가이드

| 상황 | 참조 순서 |
|---|---|
| 새 화면·기능 개발 시작 | `features/<화면>.md`(규칙) → `spec/api/<화면>-api.md`(계약) → `spec/uiux/<화면>-uiux.md`(화면 상태·카피) → `wireframe/<화면>.html` |
| API 계약 확인·DTO 작성 | `spec/api/<화면>-api.md` 그대로 선언. api 문서가 없는 화면은 `features/<화면>.md` "데이터 모델" + `backend/domain.md`로 추정하되 확정 계약으로 취급하지 않는다 |
| 필드·테이블·enum 값 확인 | `backend/domain.md` (유일한 기준. 문서에 없는 컬럼을 코드에 임의로 추가하지 않는다) |
| 에러 계약·재시도·오프라인 정책 | `features/common-error-handling.md`(정책) + 구현 위치는 각 파트 architecture.md |
| 서버 구조·코드 작성 | `backend/architecture.md` · `backend/convention.md` |
| 클라이언트 구조·코드 작성 | `frontend/architecture.md` · `frontend/convention.md` |
| 커밋·브랜치·PR | `backend/convention.md` 6장(원본 기준) · `frontend/convention.md` 6장(FE 적용값) |
| 정책 근거("왜 이렇게 동작?") | `prd/ear_root_prd.md`(FR·결정 포인트) → `features/README.md`(확정된 결정 사항 목록) |
| 재생 한도·페이월 판정 | `features/paywall.md` (판정 소유자. 다른 화면 문서는 여는 지점만 소유) |
| 드립(자동 편성) 동작 | `features/drip-scheduling.md` |
| 콘텐츠 제작(대본·QA) | `ai/PIPELINE.md`(종합 명세·불변 원칙·미결) → `ai/spec/<단계>.md`(단계별 규칙) → `ai/skills/`(프롬프트 자산) → `features/admin.md` 3.1·4.2-1(업로드·검수). `features/content-pipeline.md`는 개편 이전 P1 설계로 통합 시 개정 대상 |
| 새 기능 명세 작성 | `prd/next_doing.md`의 8항목 템플릿 |

### 파일별 인덱스

**`prd/`** — `ear_root_prd.md`(루트 PRD: FR-01~39, 티어 정책, 비기능 요구, 결정 포인트) · `next_doing.md`(명세 작성 템플릿)

**`features/`** — 동작 규칙의 원본. api·uiux와 충돌하면 이쪽이 기준.
- `README.md` — features 인덱스 + 확정된 결정 사항 목록
- `splash.md` 실행 관문 4단계 판정 · `auth.md` 소셜 로그인·이메일 인증·탈퇴 · `onboarding.md` 주제 선택→커리어→담기
- `library.md` 첫 화면, 통합 목록·탭·삭제/실행취소 · `player.md` 재생·위치 저장·완청 판정 값 · `explore.md` 추천 피드·검색·담기
- `paywall.md` **재생 한도 판정·차감·확인 팝업 소유** · `subscription.md` 구독·영수증 검증·복원
- `settings.md` 설정 허브 · `profile.md` 프로필·통계 · `interest-management.md` 관심 주제 변경 · `notification.md` 푸시 규칙 · `offline-download.md` 오프라인 저장(P1)
- `common-error-handling.md` **횡단 정책: 에러 계약·재시도·오프라인 큐·로딩 표현·401 갱신**
- 백그라운드·운영 영역: `drip-scheduling.md`(편성 알고리즘) · `content-pipeline.md`(콘텐츠 수급→생성→QA→발행) · `admin.md`(운영 도구) · `partner-control.md`(파트너 정산·통제)

**`ai/`** — 앱 밖 콘텐츠 제작 절차. 제품 기능이 아니라 운영 절차이므로 `features/`와 층을 분리했다.
- `README.md` — ai 인덱스 + `features/`와의 경계
- `PIPELINE.md` 콘텐츠 파이프라인 종합 명세 — 소스 풀 → 스윕 → 군집화·백로그(게이트 1) → 대본(윤아·이음 2인 대화체) → QA → 패키지·검수(게이트 2) → TTS → 발행. 불변 원칙 7개와 미결 총괄. 단계별 규칙은 `spec/01~09`, 프롬프트 자산은 `skills/`, 운영 DB 스키마는 `pipeline/supabase/schema.sql`, 현황은 `PIPELINE-STATUS.md`
- `metadata-pipeline.md` 대본 → 추천 메타 4종·임베딩(`enrichment.json`) 부여 — origin 무관 전 콘텐츠 대상
- 실행체·운영 DB 스키마는 파트 `pipeline/`(`pipeline/README.md` · `ai/spec/10-webapp.md`) — `docs/ai/`가 워커의 ASSET_ROOT다. `ai-server/`와 같은 EC2("AI 서버")에 올린다(spec/10 2장 정렬)
- 제작 실행 산출물(대본 초안·QA 리포트)은 커밋하지 않는다

**`spec/api/`** — HTTP 계약. 요청·응답·에러 코드의 확정본. 화면 9종 전부 작성됨 — `auth` · `onboarding` · `library` · `explore` · `player` · `profile` · `settings` · `interest-management` · `career` (각 `<화면>-api.md`). 운영 도구인 `admin-api.md`도 있다(2026-09-03 등재 — 사용자 화면이 아니라 관리자 웹 콘솔 계약이다).

**`spec/uiux/`** — 화면 ID·상태·확정 카피·접근성. 사용자 노출 문구는 이 문서와 1:1 대조. 화면 9종 전부 작성됨(각 `<화면>-uiux.md`) — 화면 ID는 `auth` A1–A19 · `library` L · `onboarding` O · `explore` E · `player` PL · `profile` P · `settings` S · `interest-management` IM · `career` CR 계열.

**`wireframe/`** — 화면 9종 html + `style.css`. uiux 화면 ID와 대응. **style.css 토큰 값은 임시값** — 디자인 확정 전까지 근거로 삼지 않는다.

**`backend/`**
- `domain.md` **스키마의 유일한 기준** (테이블·컬럼·enum·보존 정책)
- `architecture.md` 서버 계층·에러 계약(7장)·보안(9장) · `convention.md` 서버 코드 규칙 + **Git 컨벤션(6장, 전 파트 공통 기준)**
- `domain-conflicts.md` 스키마 통합 히스토리(domain.md에 흡수 후 삭제 예정) — 평소 참조하지 않음

**`frontend/`** — `architecture.md`(계층·feature 의존·전역 서비스·내비게이션·상태·에러·보안·성능) · `convention.md`(네이밍·파일 구조·수정 범위 경계·컴포넌트·상태·API·Git·테스트·lint·로깅)

## Git

- 커밋: `<type>(<scope>): <subject>` — 영문 소문자 명령형, 50자 이내. type은 `feat` `fix` `docs` `refactor` `test` `chore` `perf` `style` (`docs/backend/convention.md` 6장 기준)
- 브랜치: `<type>(<파트>)/<kebab-설명>` — 파트 표기는 `fe`/`be` (예: `feat(fe)/playback-gate`, `feat(be)/drip-batch`)
- main 직접 push 금지, PR로만 병합한다. PR 본문에 변경 요약·관련 FR·테스트 방법을 포함한다.

## 언어

- 문서·주석·테스트 설명(`it` 문장)은 한국어, 커밋 subject는 영문.
