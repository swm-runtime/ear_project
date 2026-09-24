# analytics.md — Meta 광고 측정(fbsdk) 절 추가

| 항목 | 내용 |
|---|---|
| 발행 날짜 | 2026-09-24 |
| 대상 문서 | `docs/features/analytics.md` 2장(단일 진입점) · 3.4 이벤트 사전 · 4장(IDFA 미사용) · `docs/frontend/architecture.md` 2.1(runtimeVersion 8) |
| 발행자 | FE (KAN-94) |
| 코드 | `frontend/src/shared/analytics/meta.ts` · `analytics.ts`(`track()` 이 `forwardToMeta` 호출) · `app.json`(플러그인) · `app.config.js`(개발계 끔) |

## 수정 내용

- `track()` 은 GA4 로 보낸 뒤 **Meta 로도** 보낸다 — 단 세 이벤트만: `sign_up` → `fb_mobile_complete_registration`(+`fb_registration_method`), `onboarding_complete` → `onboarding_complete`(커스텀), `play_start` 중 **계정의 첫 재생 1회** → `first_play`(커스텀). 첫 재생 판정은 기기 로컬(`analytics.meta_first_play_sent`, 계정 해시 목록) — 광고 최적화 목표엔 기기당 1회면 충분해 서버 계약을 늘리지 않는다.
- 앱 실행(activate)은 SDK 자동 기록(`autoLogAppEventsEnabled`).
- **개발계 앱·웹·mock 은 Meta 전송 없음** — JS(`IS_META_STUBBED`)와 네이티브(개발계 변형은 플러그인 `autoLogAppEventsEnabled`·`isAutoInitEnabled` false) 둘 다.
- IDFA 미수집(`advertiserIDCollectionEnabled: false`), ATT 설명문 없음 → 4장 그대로. iOS 성과는 AEM·SKAdNetwork.
- runtimeVersion 7 → 8.

## 문서에 반영할 것

- analytics.md 2장에 "Meta 는 `track()` 안에서만, 대상 3개" 한 줄. 3.4 표의 세 이벤트에 "Meta 로도" 표시. 4장에 fbsdk 도 IDFA 를 끈다고 명시. 신규 절 "3.6 광고 측정(Meta)" — 위 수정 내용.
- architecture.md 2.1 runtimeVersion 이력 8.

## 완료 조건

- Given analytics.md / When 읽는다 / Then Meta 로 가는 이벤트 3개와 개발계 제외 규칙이 적혀 있다
