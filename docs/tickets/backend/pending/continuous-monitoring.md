# [BE] 지속적인 운영 모니터링 — 점검 주기·알림 기준·주간 지표 정례화

| 항목 | 값 |
|---|---|
| 대상 | 운영 점검 체계(대시보드·알림·주간 지표) — `docs/infra/runbook.md` |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-132](https://runtime364.atlassian.net/browse/KAN-132) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 없음 |
| 근거 문서 | `features/backend-monitoring.md` · `infra/runbook.md` · KAN-98(Grafana 2단계 — `tickets/backend/pending/grafana-backend-metrics-later.md`) |
| 중요도 | Low — PM 발행(2026-10-05). 중요도 미지정이라 이번 주 마감으로 잡았다 — 바꾸려면 Jira·이 표를 함께 고친다 |
| 상태 | 대기 |

## 무엇을 한다

출시 후 운영 상태를 꾸준히 보는 체계를 만든다. 일회성 대시보드가 아니라 **누가 · 언제 · 무엇을 보는지**를 정한다.

- **점검 대상**: API 에러율·지연 · 서버 자원(EC2·DB 디스크) · Sentry 신규 이슈(앱·서버) · 파이프라인 워커 실패 · 결제·RTDN 실패
- **알림**: 대상별 임계값과 수신 채널(Slack `#ops-alerts`)
- **주간 지표**: 가입·활성·재생·이탈을 매주 정리해 회고(`retrospective/`)에 붙인다
- 운영 DB 조회는 집계·`user_id`만 쓴다(CLAUDE.md 2026-10-04 규칙)

## 완료 조건

- Given `infra/runbook.md` / When 모니터링 절을 읽는다 / Then 점검 대상·주기·담당·임계값이 표로 있다
- Given 임계값을 넘는 이벤트 / When 발생한다 / Then `#ops-alerts`에 알림이 온다(대상별 1회 이상 실측)
- Given 다음 주 회고 / When 문서를 본다 / Then 주간 지표가 붙어 있다
