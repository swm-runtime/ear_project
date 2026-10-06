# [문서] 하 등급 정리 — 본문 없는 App Store 알림 · 구독 데이터 표 문구

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/subscription-api.md` 4.6 / `docs/features/subscription.md` 8장 데이터 표 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-06 |
| 반영 날짜 | 2026-10-06 (같은 날 반영) |
| 발견 시점 | 2026-10-06 백엔드 검증 — 하 등급 11·17번(함께 고친 코드: 22·25번) |
| 심각도 | 하 |

## 문제

1. **4.6의 알림 유형 표에 거래 본문(`data`)이 없는 알림이 없다.** 구독 일괄 연장 요약(`RENEWAL_EXTENSION`/`SUMMARY`) · 동의 철회(`RESCIND_CONSENT`) · 외부 구매 토큰(`EXTERNAL_PURCHASE_TOKEN`)은 환경을 `data`가 아닌 곳에 싣는다. 구현이 환경을 `data`에서만 읽어 이 알림들을 "받지 않는 환경"(400)으로 돌려보냈고, Apple은 실패한 알림을 1·12·24·48·72시간 뒤에 다시 보낸다(상태에는 영향 없는 소음).
2. **`subscription.md` 데이터 표가 다른 절과 어긋난다.** `archived_subscriptions`를 "재가입 복원 근거"라 적었는데 4.6·7장과 `subscription-api.md` 7장은 "거래 ID만으로 복원하지 않는다"이다(7장 본문은 #1158에서 정정, 표가 남았다). `users.tier`의 갱신 경로도 `SubscriptionService`가 아니라 `BillingSyncService.syncUserTier`다.

## 수정 내용

- `subscription-api.md` 4.6 표에 "거래 본문이 없는 알림" 행 추가 — 적재만 하고 200. 환경은 `summary` · `appData`에서, 외부 구매 토큰은 식별자 접두사로 읽는다(Apple 공식 라이브러리의 `verifyAndDecodeNotification`과 같은 규칙).
- `subscription.md` 데이터 표 두 행의 문구 정정.

## 완료 조건

- Given 4.6의 알림 유형 표 / When `data`가 없는 알림을 찾는다 / Then 적재만 하고 200으로 끝낸다고 적혀 있다
- Given 샌드박스를 받는 서버 / When `RENEWAL_EXTENSION`(`SUMMARY`) 알림이 온다 / Then 400이 아니라 받아서 적재한다
- Given `subscription.md` 데이터 표 / When `archived_subscriptions` 행을 본다 / Then 복원의 근거가 아니라고 적혀 있다

## 처리 기록

- 2026-10-06 발행·반영. 코드 `billing/app-store/apple-app-store.gateway.ts`(`pickNotificationEnvironment`) + 테스트 4건. 같은 PR에서 문서 변경 없는 정리 3건을 함께 했다: `APP_STORE_ENVIRONMENTS`의 쉼표 앞뒤 공백 허용(`env.validation.ts`) · `content_audio_renditions` FK 이름 선언 · `push.sh` 선택 키 목록에 `SLACK_SIGNUP_WEBHOOK_URL` 추가.
