# 글로벌 가입 서버 스위치 `GLOBAL_SIGNUP_ENABLED`

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-10-15 |
| 요청 파트 | 백엔드 |
| 발행자 | BE (박준현 결정 2026-10-15) |
| 반영 대상 | `spec/api/global-api.md` 2.1 시장 모델 "판정" 행 · `spec/api/auth-api.md` 4.1 `locale` 소절 · `infra/runbook.md`(글로벌 출시 때 켜는 순서) |
| 코드 반영 | PR `feat(be)/global-signup-switch` |

## 수정 내용

- 시장 판정에 **서버 스위치 `GLOBAL_SIGNUP_ENABLED`**(기본 닫힘)를 둔다. 닫혀 있으면 `preferred_language = en`(또는 영어 기기의 구 앱 폴백)이어도 **`kr`로 판정**하고 로그 `market resolved`의 `source`를 `global_closed`로 남긴다.
- `true`를 명시했을 때만 열린다. 글로벌 출시 때 GLOBAL 주제 노출·콘텐츠 발행이 끝난 뒤 켠다. 개발계는 GLOBAL 흐름을 시험하려면 켠다.

## 사유

시장은 가입 때 1회 정하고 바꿀 수 없다. 운영 GLOBAL 카탈로그가 비어 있는 동안(주제 8개 전부 숨김·콘텐츠 0편, 2026-10-15 실측) GLOBAL로 가입하면 온보딩 주제가 0개라 진행할 수 없다. 가입 언어 선택 화면(FE)이 다음 OTA로 운영 1.2.1에 나갈 수 있어(runtime 35 — main 머지 시 운영 채널 자동 발행), 앱 배포와 무관하게 서버가 막는다.

## 완료 조건

- Given `global-api.md` 2.1 / When 판정 행을 읽는다 / Then 스위치(기본 닫힘)와 닫혔을 때 `kr` 판정이 적혀 있다
- Given `runbook.md` / When 글로벌 출시 절차를 읽는다 / Then "GLOBAL 주제 노출·콘텐츠 발행 → `GLOBAL_SIGNUP_ENABLED=true`" 순서가 있다

## 처리 기록

- 2026-10-16 반영 — `global-api.md` 2.1 판정 행 · `auth-api.md` 4.1 `locale.preferred_language` 행 · `infra/runbook.md` 4장 스위치 목록(켜는 순서: 주제 노출 → 콘텐츠 발행 → 스위치). 코드(`market.policy.ts`·`user.service.ts`)와 대조함.
