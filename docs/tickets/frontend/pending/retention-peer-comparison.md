# [FE] 리텐션 고도화 — 다른 사용자 비교 표시·푸시 탭 처리

| 항목 | 값 |
|---|---|
| 대상 | BE가 정한 비교 항목·푸시 계약을 앱에 붙인다 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-273](https://runtime364.atlassian.net/browse/KAN-273) |
| 발행 날짜 | 2026-10-26 |
| 시작 날짜 | 2026-10-26 |
| 기한 | 2026-10-29 (Medium — 3일 안. PM 2026-10-26 "급한 것"으로 지정) — 선행이 기한 안에 안 끝나면 이 티켓 기한도 못 지킨다. 그때는 사유를 적는다 |
| 선행 | `backend/pending/retention-peer-comparison.md`(KAN-272) |
| 중요도 | Medium — PM 지정(2026-10-26 "급한 것"). 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |
| 상태 | 코드 반영 — 실기기 확인 대기 |

## 요청

**BE가 정한 다른 사용자 비교와 푸시를 앱에 붙인다**(10월 5주차 계획(2026-10-26 회의)).

- 서버가 판정한 비교 문구를 **표시만** 한다(클라이언트에서 판정하지 않는다)
- 푸시를 보내기로 하면: 알림 탭 → 목적 화면(`features/notification.md` 4.4 순서 — 스플래시 판정 먼저), 수신 토글이 따로 생기면 설정 화면에 추가
- 카피는 `spec/uiux/`에 먼저 올린 뒤 1:1로 맞춘다. 범위는 BE 티켓 결정에 따라 확정한다

## 완료 조건

- Given BE 계약 확정 / When 비교 대상이 있는 계정으로 연다 / Then 서버가 준 비교 문구가 정해진 위치에 보인다
- Given 새 푸시가 온다 / When 탭한다 / Then 정해진 화면으로 열린다(온보딩 미완료면 완료 뒤)

## 처리 기록

- 2026-10-26 BE 계약 확정(KAN-272 — 박준현 Jira 댓글). 비교는 **저녁 리텐션 푸시**(`notification.md` 4.6)로 가고 이번 범위에 새 화면 표시는 없다 — 앱 안 비교는 프로필 주제 한 줄(KAN-266~268)이 맡는다. 완료 조건 첫 줄("비교 문구가 정해진 위치에 보인다")은 푸시 본문(서버가 렌더)으로 읽는다. 수신 토글 신설 없음(마케팅 수신 동의 토글, `settings.md` 4.1).
- 2026-10-27 **코드 반영** — 브랜치 `feat(fe)/retention-push-tap`:
  - `parsePushData`가 `retention.<규칙>.<변형>`도 받는다(`PushArrival` → `PushMessage { type, target, contentCount, rule }`). 탭 처리는 드립과 같은 경로(4.4).
  - 드립 도착 전용 처리와 분리: 포그라운드에서 OS 배너를 숨기는 것·라이브러리 탭 배지 갱신·`push_foreground_banner`는 `drip_arrival`만.
  - 분석 `push_open`에 `push_type`·`push_rule`(`analytics.md` 갱신).
  - 테스트: 리텐션 변환(규칙·변형·목적지·폴백·잘못된 type).
  - **남은 것: 실기기** — 개발계는 `dry_run`이라 실제 발송이 없다. 개발계 기기에 `type: retention.resume_content.a` 테스트 푸시를 보내 탭 → 플레이어, 앱을 켠 상태에서는 안 보이는지(아래 정정) 본다. 확인되면 `archive/` + Jira 완료, BE는 운영 OTA 뒤 `RETENTION_PUSH_MODE=on`.
- 2026-10-27 **정정 반영**(박준현 Jira 댓글 18:54 — 10-26 댓글 2번을 바꿈): 포그라운드 리텐션 알림은 **OS 배너도 숨기고 앱 안 표시도 없다**. 숨긴 것은 `push_foreground_suppressed { push_type, push_rule }`(반응률 분모 제외용 — `analytics.md`·`notification.md` 4.5 갱신). 백그라운드·종료 상태의 탭 이동과 `push_open` 파라미터는 그대로. 브랜치 `fix(fe)/retention-push-foreground` — 릴리스 #2081 전에 dev로.
