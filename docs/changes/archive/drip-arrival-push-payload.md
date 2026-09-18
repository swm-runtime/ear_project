# [문서] 드립 도착 푸시의 페이로드·딥링크 형식과 notification 모듈 의존 방향

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/notification.md` 3장(발송 페이로드) · `backend/architecture.md` 4.5(의존 방향 표 — Notification 신설 · DripBatch · Auth) |
| 요청 파트 | 백엔드(KAN-68 구현 중 확정) — 앱 쪽 소비는 KAN-69(`tickets/frontend/pending/push-sdk-integration.md`) |
| 발행 날짜 | 2026-09-17 |
| 반영 날짜 | 2026-09-17 (KAN-68 PR에서 함께 반영) |
| 발견 시점 | KAN-68 구현 — `notification.md` 3장이 `deep_link`를 "라이브러리 또는 특정 콘텐츠"로만 적어 서버가 무엇을 보낼지, 앱이 어디서 읽을지 정해져 있지 않았다 |
| 심각도 | 하 — 아직 앱이 푸시를 받지 않는다. FE 연동(KAN-69) 전에 계약을 고정한다 |

## 수정 내용

1. **딥링크 형식** — `ear://library`(2편 이상) · `ear://contents/{content_id}`(1편). 앱 스킴(`app.json` `scheme: ear`)을 쓴다.
   - 라이브러리는 웹 주소가 없고, 알림 탭은 앱 안 이동이라 공유 링크(`https://earcast.co.kr/contents/:id`, `share.md`)의 유니버설 링크를 거칠 이유가 없다.
   - **FE 확인 필요** — 앱에 아직 링킹 설정이 없다. 공유 링크 경로와 합치고 싶으면 KAN-69 착수 시 서버 상수(`notification.constant.ts`) 두 개만 바꾸면 된다.
2. **앱이 읽는 위치** — 푸시의 `data` 필드: `{ "type": "drip_arrival", "deep_link": "...", "content_count": N }`. title·body는 OS 표시용이다.
3. **의존 방향**(`architecture.md` 4.5)
   - `Notification → User`(신설) — `notification_logs` 소유. 기기 토큰·알림 토글 조회
   - `DripBatch → Notification` — 편성 직후 발송
   - `Auth`의 비고 — 로그아웃 시 `DeviceTokenService`로 토큰 무효화(기존 `Auth → User` 안)

## 사유

서버가 먼저 보내기 시작하면 앱이 받을 형식이 코드에만 있게 된다. FE가 KAN-69에서 문서만 보고 구현할 수 있어야 한다.

## 완료 조건

- Given `notification.md` 3장 / When 발송 페이로드를 읽는다 / Then `deep_link` 두 형식과 `data` 필드 구조가 적혀 있다
- Given `architecture.md` 4.5 / When Notification 행을 찾는다 / Then 의존이 User 하나이고 DripBatch 행에 Notification이 있다
