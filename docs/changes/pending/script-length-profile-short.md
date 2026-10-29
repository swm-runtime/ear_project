# 한국판 길이 프로필(짧은 판) — spec/04 분량 규칙 · spec/10 작업 유형 · spec/11 썸네일 복사

| 항목 | 값 |
|---|---|
| 대상 문서 | `ai/spec/04-script.md`(2장 설계 분량 · 6장 "분량" 규칙에 프로필 분기) · `ai/spec/10-webapp.md`(작업 유형 `remake` · 실험 탭) · `ai/spec/03-backlog.md`(백로그 컬럼 `length_profile`·`remake_of`) · `ai/PIPELINE.md`(불변 원칙 "하한 13분"에 예외 각주) |
| 요청 파트 | AI |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(ai)/length-profile-short` (KAN-296) |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

KAN-296(단기 실험 ④) — 짧은 길이와 새 도입 훅이 완청률을 올리는지 본다. 박수헌 결정(2026-10-29): 기존 편은 그대로 두고, **발행된 편의 주제를 재활용해 짧은 판을 따로 만든다.** 새 앱 배포 뒤 가입한 사용자에게는 짧은 판만 나간다(BE 코호트 분리 — 별도 BE 티켓 필요, 2026-10-29 현재 없음). 비교는 같은 주제·길이만 다른 두 판의 완청률이다.

## 고칠 내용

### 1. `spec/04-script.md` — 분량 규칙에 길이 프로필

- 2장·6장의 "하한 13분·15분 목표·26분 분할·L0 4,300자"는 **기본 프로필(standard)** 의 값이다. 후보마다 `backlog.length_profile`(0040)이 있고 기본값이 standard 라 종전 편은 바뀌지 않는다.
- **짧은 판(short)**: 하한 5분(약 1,700자)·목표 9분·상한 12분(약 4,100자)·분할 없음(넘치면 덜어냄)·본문 구간 2~3개·사용 소스는 구간 수에 맞춰 줄인다(3건 하한 유지). 설계는 원본 구성안·claims 를 보지 않고 소스만 받아 새로 짜되 **축은 원본과 같은 질문**을 유지한다. 코드: `packages/pipeline/src/length-profile.ts`(규격·프롬프트 블록), `design-single.ts`(하한·상한·구간 수 검사 — short 만), `draft-two-stage.ts` L0(하한·상한).
- **도입(규칙 13)의 짧은 판 변형 — 선취 훅**: 인트로 주제 선언 바로 뒤 첫 해설 턴이 이 편에서 가장 의외인 결과 하나(claims 의 수치·장면)를 한두 문장으로 말하고, 진행 턴 하나가 "왜"를 묻고 본문 #1 로 들어간다. [도입] 구역은 그 두 턴뿐 — 경험담·사물·되받기 장면 없음, 통념 반전 틀 금지(규칙 13 그대로). 코드가 short 편에만 덧붙이고(`lengthWriteBlock`) 규칙 자산은 바뀌지 않는다.
- 비평은 짧은 판 규격 알림 한 절을 받는다(구간 수·반론 부재·도입 두 턴은 결함이 아님). QA 는 바뀌지 않는다(항목 7 보류 그대로).

### 2. `spec/03-backlog.md` — 백로그 컬럼

- `length_profile`(standard|short, 기본 standard) · `remake_of`(원본 후보 id). 재제작 후보는 스윕·군집화·중복 판정을 타지 않고 발행된 단편에서 바로 approved 로 생긴다(승인자 `remake:<워커>`). 설계의 "다른 편이 쓴 문단 제외"에서 원본 편은 제외 대상이 아니다.

### 3. `spec/10-webapp.md` — 작업 유형 `remake` · 실험 탭

- 작업 유형 `remake`(IO 전용): 콘솔 실험 탭 [짧게 다시 만들기] → 워커가 후보 행을 만들고 초안을 건다(콘솔 역할은 backlog INSERT 권한이 없다 — 0003 RLS).
- 콘솔 `/experiments`: 재제작 편 진행(초안→QA→비평→TTS→패키지)과 발행된 단편 목록(주제·검색, 단건·일괄 요청). 재제작 후보는 백로그(게이트 1)와 일반 발행 목록에 보이지 않는다 — 신규 코호트 전용이라 전 사용자 발행에 섞이면 안 된다. 발행 자체는 BE 변형 필드가 생긴 뒤(발행 메타 `length_profile`·`remake_of`·`remake_of_content_ref` 는 이미 싣는다).

### 4. `spec/11-series.md` 7장 — 썸네일

- 재제작 편의 썸네일은 원본 편의 썸네일을 그대로 복사한다(`thumbnail.ts` copyOriginalThumbnail, 실행 기록 `remake-copy`). 비교 변수를 길이 하나로 남기기 위함.

### 5. `PIPELINE.md` 불변 원칙 — "한 편은 13분 이상"

- 각주: KAN-296 실험의 짧은 판(length_profile short)은 예외다. 실험 결과가 나오면 원칙을 다시 정한다.

## 완료 조건

- Given 위 네 문서 / When 다음 통합 / Then 분량 규칙이 프로필별로 적혀 있고, `remake` 작업 유형과 실험 탭이 spec/10 에 있다.

## 추가 (2026-10-30) — 짧은 판 전용 규칙·루브릭 자산

- `spec/10-webapp.md` 3.2 자산 목록에 15·16번째 DB 자산: `skills/draft/short.md`(short-v1, 짧은 판 설계·작성) · `skills/critic/rubric-short.md`(shortcritic-v1, 짧은 판 비평 3장 대체). 둘 다 번들 밖·항상 active(시리즈 규칙과 같은 방식).
- `spec/04-script.md` 짧은 판 절: 사용 소스 하한 2건(후보 단계 3건 규칙은 그대로) · 축 소스는 모든 구간에 배정 가능 · 질적 규칙은 short.md 가 진실.
- `spec/09-quality-cycle.md`: 짧은 판은 짧은 판 루브릭으로 채점 · 관문 기준 `settings.automation.short_threshold`(보정 전 비움) · 사람 판정 3편으로 보정.
- 근거: `docs/ai/skills/draft/CHANGELOG.md` short-v1.

