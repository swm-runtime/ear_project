# [문서] `features/backend-monitoring.md` — Grafana Cloud 병행 운영 반영

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/backend-monitoring.md` 3장(데이터 경로) · 8장 완료 조건(15초 갱신 문구) · 9장 미결 |
| 요청 파트 | 문서(구현 없음 — 인프라 결정 KAN-97, 2026-09-25) |
| 발행 날짜 | 2026-09-26 |
| 발견 시점 | Grafana Cloud 통합(KAN-97) 처리 중. 이 문서는 어드민 콘솔만을 감시 화면으로 서술하고 있어, 이제 두 화면이 병행된다는 사실과 어느 쪽이 기준인지가 빠져 있다 |
| 심각도 | 하 — 운영 절차 문서의 현행화 |

## 넣을 내용

### 3장 데이터 경로 끝에 한 절 추가 — "Grafana Cloud 와의 병행 (2026-09-25)"
- CloudWatch(EC2 지표·`/ear/api`·`/ear/caddy` 로그)·Sentry·합성 헬스체크는 **Grafana Cloud 대시보드 "ear 운영"** 에도 표시된다(`infra/inventory.md` Grafana Cloud 행). 코드 변경 없음 — 같은 원천을 두 화면이 읽는다.
- **어드민 콘솔은 그대로 유지한다.** 실시간 로그(5초 폴링)·에러 모아보기·서버 상태(`/admin/system-stats`)·요청 통계는 콘솔이 소유한다. Grafana 는 EC2·헬스체크·Sentry 를 함께 보는 상황판이다.
- **같은 값이 다르게 보일 때의 기준**: 요청 p50/p95 는 콘솔(로그 파싱)이 현재 기준이다. 백엔드가 `/metrics` 를 내보내는 2단계(KAN-98) 이후에는 Grafana 히스토그램이 기준이 되고 그때 이 절을 고친다.
- Grafana 알림(헬스체크 실패·TLS·CPU 70%·메모리 80%)은 Slack 에러 채널로 간다. 백엔드 `resource-alert` 의 CPU·메모리 Slack 경보와 임계가 겹치므로 몇 주 비교 뒤 하나로 정리한다(미결로 등재).

### 8장 완료 조건 — "15초마다 갱신된다" 문구 정정
- 코드와 3장 서술(2026-09-06 결정 "자동 폴링 없음")과 어긋난다. "열 때 1회 + [새로고침]" 으로 고친다. `spec/api/admin-api.md` 4.9 의 같은 문구도 함께.

### 9장 미결 정리
- "메모리·디스크의 CloudWatch 지표화" — **해소**(2026-09-11 CloudWatch Agent, `infra/inventory.md`). 삭제.
- 추가: "자체 CPU·메모리 Slack 경보와 Grafana Alerting 중복 — 하나로 정리(비교 기간 뒤)".
- 추가: "콘솔 서버 상태·요청 통계 탭의 존속 — 2단계(KAN-98) 이후 재검토".

## 완료 조건
- Given `backend-monitoring.md` 3장 / When 읽는다 / Then Grafana 와 콘솔이 병행되며 각자 무엇을 소유하는지, p95 의 기준이 어느 쪽인지 적혀 있다
- Given 8장 / When 읽는다 / Then "15초" 문구가 없다
- Given 9장 / When 읽는다 / Then CloudWatch 지표화 항목이 없고 알림 중복 정리 항목이 있다
