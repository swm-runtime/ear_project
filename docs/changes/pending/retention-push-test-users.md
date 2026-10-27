# notification — 리텐션 알림 시험 대상(`RETENTION_PUSH_TEST_USER_IDS`) (BE · KAN-272)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/notification.md` 4.6 "서버 스위치" 행 · `infra/runbook.md`(환경 변수 표가 있으면 같은 줄) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-27 |
| 시작 날짜 | 2026-10-27 |
| 기한 | 2026-10-30 (Medium — 다음 통합 때) |
| 선행 | 없음 |
| 중요도 | Medium — 서술 추가. 기존 동작(`off`·`dry_run`·`on`)은 바뀌지 않는다 |
| 관련 | [KAN-272](https://runtime364.atlassian.net/browse/KAN-272) · 브랜치 `feat(be)/retention-push-test-users` |

## 배경

리텐션 알림을 운영에서 켜기 전에 실제 문구·도착을 본인 기기로 확인할 길이 없었다. `dry_run`은 아무에게도 보내지 않고, `on`은 동의자 전원에게 보낸다. 그래서 운영 서버에 들어가 일회성으로 보내야 했다.

## 고칠 내용

`notification.md` 4.6 "서버 스위치" 행에 덧붙인다:

> **시험 대상 `RETENTION_PUSH_TEST_USER_IDS`**(쉼표로 구분한 사용자 id, 2026-10-27): `dry_run`일 때 이 사용자에게만 실제로 보낸다. 나머지는 종전처럼 로그만 남긴다. 대상 조건(마케팅 동의·보낼 기기), 규칙 판정, 빈도 제한(20시간 1건·7일 3건)은 그대로라 성립하는 규칙이 없으면 시험 대상도 받지 않는다. 보낸 건은 실제 발송과 같이 `notification_logs`에 남는다. 로그에는 시험 대상 수(`test_users`)와 이번에 보내려 한 수(`test_sending`)만 싣고 사용자 id는 싣지 않는다. `on`·`off`에서는 쓰지 않는다. uuid 형식이 아닌 값은 버린다.

## 완료 조건

- Given `notification.md` 4.6 / When 서버 스위치 행을 본다 / Then 시험 대상 설정과 `dry_run`에서만 쓰인다는 것이 적혀 있다

## 처리 기록

- 2026-10-27 발행(BE — 구현과 같은 PR).
