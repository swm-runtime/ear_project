# 이어 (ear_project)

AI 생성 팟캐스트 서비스 '이어'의 저장소. 3인 팀, 백엔드는 NestJS + PostgreSQL, 프론트엔드는 React Native(Expo)로 개발한다.

> 이 문서는 **팀 공용**이다. 역할(FE/BE)별 지침·개인 설정은 각자 `CLAUDE.local.md`(gitignore 대상)에 둔다.

## 공통 원칙

- **자기 파트 코드만 수정한다.** 상대 파트의 코드·문서는 참조만 하고, 수정이 필요하면 해당 파트 담당에게 전달한다.
- **판정은 서버가 하고 클라이언트는 표시만 한다.** 재생 한도·만료·서비스 날짜(04시 경계) 판정을 클라이언트에서 하지 않는다. 티어명 하드코딩 금지, 기기 시각을 정책 판정에 사용 금지.
- **문서와 충돌하는 구현은 만들지 않는다.** 규칙이 틀렸다면 코드가 아니라 문서를 먼저 고친다.
- 커밋·푸시는 사용자가 명시적으로 요청했을 때만 수행한다.

## 문서 지도 — 어떤 상황에 어떤 문서를 보는가

```
prd/          무엇을·왜 만드는가 (FR-01~39)
  └─ pages/         화면·기능별 동작 규칙의 소유자 (판정·상태 전이·예외)
       ├─ spec/api/       동작 규칙의 HTTP 계약 표현 (엔드포인트·DTO·에러 코드)
       ├─ spec/uiux/      동작 규칙의 화면 표현 (화면 ID·상태·카피·접근성)
       └─ wireframe/      화면 ID의 시각 참조 (HTML)
backend/      서버 구조·스키마·코드 규칙 (스키마의 유일한 기준)
frontend/     클라이언트 구조·코드 규칙
```

문서 간 규칙이 충돌하면 **동작 규칙은 `pages/`가, 스키마는 `backend/domain.md`가, 통신 계약은 `spec/api/`가 기준**이다.

### 상황별 참조 가이드

| 상황 | 참조 순서 |
|---|---|
| 새 화면·기능 개발 시작 | `pages/<화면>.md`(규칙) → `spec/api/<화면>-api.md`(계약) → `spec/uiux/<화면>-uiux.md`(화면 상태·카피) → `wireframe/<화면>.html` |
| API 계약 확인·DTO 작성 | `spec/api/<화면>-api.md` 그대로 선언. api 문서가 없는 화면은 `pages/<화면>.md` "데이터 모델" + `backend/domain.md`로 추정하되 확정 계약으로 취급하지 않는다 |
| 필드·테이블·enum 값 확인 | `backend/domain.md` (유일한 기준. 문서에 없는 컬럼을 코드에 임의로 추가하지 않는다) |
| 에러 계약·재시도·오프라인 정책 | `pages/common-error-handling.md`(정책) + 구현 위치는 각 파트 architecture.md |
| 서버 구조·코드 작성 | `backend/architecture.md` · `backend/convention.md` |
| 클라이언트 구조·코드 작성 | `frontend/architecture.md` · `frontend/convention.md` |
| 커밋·브랜치·PR | `backend/convention.md` 6장(원본 기준) · `frontend/convention.md` 6장(FE 적용값) |
| 정책 근거("왜 이렇게 동작?") | `prd/ear_root_prd.md`(FR·결정 포인트) → `pages/README.md`(확정된 결정 사항 목록) |
| 재생 한도·페이월 판정 | `pages/paywall.md` (판정 소유자. 다른 화면 문서는 여는 지점만 소유) |
| 드립(자동 편성) 동작 | `pages/drip-scheduling.md` |
| 새 기능 명세 작성 | `prd/next_doing.md`의 8항목 템플릿 |

### 파일별 인덱스

**`prd/`** — `ear_root_prd.md`(루트 PRD: FR-01~39, 티어 정책, 비기능 요구, 결정 포인트) · `next_doing.md`(명세 작성 템플릿)

**`pages/`** — 동작 규칙의 원본. api·uiux와 충돌하면 이쪽이 기준.
- `README.md` — pages 인덱스 + 확정된 결정 사항 목록
- `splash.md` 실행 관문 4단계 판정 · `auth.md` 소셜 로그인·이메일 인증·탈퇴 · `onboarding.md` 주제 선택→커리어→담기
- `library.md` 첫 화면, 통합 목록·탭·삭제/실행취소 · `player.md` 재생·위치 저장·완청 판정 값 · `explore.md` 추천 피드·검색·담기
- `paywall.md` **재생 한도 판정·차감·확인 팝업 소유** · `subscription.md` 구독·영수증 검증·복원
- `settings.md` 설정 허브 · `profile.md` 프로필·통계 · `interest-management.md` 관심 주제 변경 · `notification.md` 푸시 규칙 · `offline-download.md` 오프라인 저장(P1)
- `common-error-handling.md` **횡단 정책: 에러 계약·재시도·오프라인 큐·로딩 표현·401 갱신**
- 백그라운드·운영 영역: `drip-scheduling.md`(편성 알고리즘) · `content-pipeline.md`(콘텐츠 수급→생성→QA→발행) · `admin.md`(운영 도구) · `partner-control.md`(파트너 정산·통제)

**`spec/api/`** — HTTP 계약. 요청·응답·에러 코드의 확정본. 현재 `auth-api.md` · `library-api.md` · `onboarding-api.md` 3개, 화면별 순차 작성 중.

**`spec/uiux/`** — 화면 ID·상태·확정 카피·접근성. 사용자 노출 문구는 이 문서와 1:1 대조. 현재 `auth-uiux.md`(A1–A18) · `library-uiux.md`(L1–L11) · `onboarding-uiux.md`(O1–O11).

**`wireframe/`** — `auth/library/onboarding.html` + `style.css`. uiux 화면 ID와 대응. **style.css 토큰 값은 임시값** — 디자인 확정 전까지 근거로 삼지 않는다.

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
