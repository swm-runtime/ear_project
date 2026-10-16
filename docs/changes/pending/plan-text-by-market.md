# 요금제 이름·설명 — 사용자 시장의 언어로 내려주기 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 8.1 `plans` · `spec/api/subscription-api.md` 4.1(`plans[].name`·`description`) · 4.2 · `spec/api/settings-api.md`·`profile-api.md`의 `plan.plan_name` · `spec/api/global-api.md`(요금제 행) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-16 |
| 관련 | BE [KAN-192](https://runtime364.atlassian.net/browse/KAN-192) `tickets/backend/pending/global-plans-storefront.md`(보류 중 — 재개 조건 3번에 해당하는 부분만 처리) |

## 배경

KAN-192를 보류할 때(2026-10-14) "요금제 이름·설명이 한국어인 점은 FE가 영어 리소스로 보여 준다"고 가정했다. 실제 앱(`PlanList.tsx`)은 서버의 `plans.name`·`description`을 **그대로** 그린다. 그래서 GLOBAL 사용자도 요금제 화면에서 "하루 5편까지 들을 수 있어요", 체험 중이면 "무료 체험"을 봤다. 앱이 티어별 영어 문구를 따로 들면 한도를 바꿀 때 두 곳이 어긋나므로, **문구의 원천을 서버 한 곳으로 두고 서버가 언어를 고른다.**

## 수정 내용

- **`domain.md` 8.1 `plans`** — 컬럼 두 개를 추가한다(마이그레이션 `1790400000000-AddPlanEnglishText`).
  - `name_en varchar(50) NULL`
  - `description_en text NULL`
  - 주석: "영어 이름·설명. GLOBAL 사용자에게 내려준다. 언어는 기기 언어가 아니라 **시장**으로 고른다(푸시·메일과 같은 기준). NULL이면 한국어로 내려간다. 한도를 바꾸면 한국어·영어 설명을 함께 고친다."
  - 현행 값: light `Light`·"Listen to up to 2 episodes a day" · daily `Daily`·"Listen to up to 5 episodes a day" · pro `Pro`·"Listen as much as you like, with no daily limit" · trial `Free trial`·"Unlimited listening during your free trial"(체험 행은 `is_active=false`라 목록에는 나오지 않고 요금제 카드 이름에만 쓰인다).
- **`subscription-api.md` 4.1** — `plans[].name`·`description`은 **사용자 시장의 언어**다(KR 한국어 · GLOBAL 영어). 앱은 받은 문구를 그대로 그린다.
- **`subscription-api.md` 4.2 · `settings-api.md` · `profile-api.md`** — `plan.plan_name`(현재·예약·지급 요금제 이름)도 같은 규칙이다(GLOBAL 체험 중 `Free trial`).
- **`global-api.md`** — 요금제 행에 "GLOBAL 전용 요금제 행·상품은 두지 않는다(같은 상품을 현지가로 판다). 이름·설명만 시장 언어로 내려준다(2026-10-16)"를 적는다.

## 범위 밖

- 스토어 결제창·구독 관리 화면의 상품 이름 — 스토어 콘솔의 상품 현지화(영어 추가)로 한다(사람 손, 같은 영어 문구를 쓴다).
- GLOBAL 전용 가격·혜택·상품, 결제 국가·통화 저장 — KAN-192의 나머지(보류 그대로).

## 완료 조건

- Given `domain.md` 8.1 / Then `name_en`·`description_en`과 "언어는 시장으로 고른다"가 있다
- Given `subscription-api.md` 4.1 / Then `name`·`description`이 사용자 시장의 언어라고 적혀 있다

## 처리 기록

- 2026-10-16 발행(서버 구현 PR과 함께). 반영 전.
