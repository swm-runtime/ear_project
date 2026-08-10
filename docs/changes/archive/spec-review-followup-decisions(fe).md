# [FE] spec 작성 검토 후속 결정 5건 — 미니플레이어 복원·토스트 표기·원문 클릭 큐·완청 판정 지연·재청취 게이트 호스트

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-08-10 |
| 대상 문서 | `features/player.md` 5장·4.5, `features/common-error-handling.md` 4.5, spec 4건(`player-api`·`player-uiux`·`interest-management-uiux`) |
| 요청 파트 | 프론트엔드 (spec 신규 작성 검토 중 사용자 결정 2026-08-10) |
| 파급 | 원문 클릭 큐·멱등키는 FE 구현 + BE 멱등 처리 대상 |

## 결정 내용

1. **미니플레이어 스와이프 종료 후 재실행 복원 — 유지.** 종료는 이번 실행에서 치우는
   조작이고, 앱 재실행 시 복원 판정(`library.md` 4.2)은 영향받지 않는다(다시 나타난다).
   → `player.md` 5장 명문화, `player-uiux.md` 미결 해소.
2. **관심사 저장 성공 토스트 — "관심사가 변경되었어요" 유지.** 화면 내 "관심 주제" 계열
   문구와의 혼용을 수용한다(features 개정 없음). → `interest-management-uiux.md` 미결 해소.
3. **원문 유입 클릭을 오프라인 큐에 편입한다**(전부 보존·순서대로 전송). 정산 지표
   원천(`content_stats.source_link_click_count`)이라 유실을 감수하지 않는다. 재전송 중복
   방어로 해당 엔드포인트는 `Idempotency-Key` 필수. → `common-error-handling.md` 4.5 표,
   `player.md` 4.5, `player-api.md` 4.5·공통 규약·미결 반영.
4. **완청 판정의 전송 지연(최대 5초) 수용 — 현행 유지.** 판정은 서버가 위치 저장을 받을 때
   수행하며, 90% 도달 순간의 주기 외 즉시 전송 규칙은 추가하지 않는다(`player.md` 4.3 저장
   시점 목록 무변경). → `player-api.md` 미결 해소.
5. **재청취 게이트의 호스트 — 플레이어.** 완료 화면(PL3)의 ▶ 재청취가 재청취 창 밖이면
   플레이어가 재생을 시작시킨 화면으로서 확인 팝업(소진 시 페이월)을 직접 띄운다 —
   `paywall.md` 4.2 팝업 소유 규칙의 유일한 예외로 명문화. `entry_point`에 `player` 값 추가.
   → `paywall.md` 3장·4.2, `player.md` 2장, `library-api.md` 4.4 enum, `player-api.md` 공통
   규약, `player-uiux.md` 1장·미결 반영.

## 완료 조건

- Given 이 결정들이 반영된다 / When `player.md` 5장·4.5, `common-error-handling.md` 4.5를
  읽는다 / Then 미니플레이어 복원 유지·원문 클릭 큐 편입이 서술되어 있다
- Given `player-api.md`·`player-uiux.md`·`interest-management-uiux.md`의 미결 사항을 읽는다 /
  When 위 4개 항목을 찾는다 / Then 전부 해소 표시와 결정 내용이 기재되어 있다

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | **2026-08-10** — 발행 즉시 직접 반영(사용자 결정) |
