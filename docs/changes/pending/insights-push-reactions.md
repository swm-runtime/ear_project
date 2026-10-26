# 서비스 지표 — 알림 반응 표(드립 도착 기준선 · 리텐션 규칙·변형별)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 4.22(응답 `push_reactions[]`) · `features/backend-monitoring.md`(서비스 지표 행 — 알림 반응 표) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-26 |
| 시작 날짜 | 2026-10-26 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/insights-push-reactions` |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

저녁 리텐션 알림(KAN-272, `notification.md` 4.6)의 문구 변형을 고르려면 규칙·변형별 반응을 봐야 한다. 실행 요약을 Slack 으로 보내지 않기로 해(#2066) 성과는 지표 탭에서 본다(2026-10-26 박준현 결정).

## 고칠 내용

1. `admin-api.md` 4.22 응답에 추가:
   > `push_reactions[]` — 창(`days`) 안에 **보낸**(`notification_logs.status = sent`) 알림의 종류별 반응. 행: `type`(`drip_arrival` 또는 `retention.<규칙>.<변형>`) · `rule`·`variant`(리텐션만, 드립은 null) · `sent` · `reacted`(보낸 뒤 **2시간 안에** 그 사용자의 새 재생 행 `play_records.played_at` 또는 재생 위치 저장 `playback_progresses.updated_at`이 있음) · `reaction_rate`(`reacted / sent`, 분모 0이면 null). `market` 필터를 따른다(지금 시장). 앱이 탭을 서버에 알리지 않아(`opened_at` 미기록) 탭 대신 재생으로 역산한 근사다 — 알림 없이 앱을 열어 들은 것도 잡히고, 그 뒤 다시 들어 위치 저장 시각이 밀리면 빠질 수 있다.
2. `backend-monitoring.md` 서비스 지표 행 — "알림 반응 표(창 기준): 알림(규칙 이름 · 드립 도착은 기준선) · 문구 변형 · 발송 · 반응 · 반응률 · 표본 적음 표시. 옛 서버(필드 없음)는 표를 숨긴다" 추가.

## 완료 조건

- Given 위 두 문서 / Then `push_reactions`의 정의(보낸 것만 · 2시간 · 재생 원천 · 근사의 한계)와 화면 표가 적혀 있고 `AdminInsightsRepository.pushReactions`와 같다

## 처리 기록

- 2026-10-26 발행(박준현).
