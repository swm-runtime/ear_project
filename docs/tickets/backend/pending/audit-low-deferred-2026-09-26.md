# [BE] 2026-09-26 전수 감사 — 하 등급 보류 12건 (중요하지 않음 · Jira 미반영)

| 항목 | 값 |
|---|---|
| 대상 | 아래 표의 파일들 — 전부 소규모(S) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(백엔드·인프라) |
| 발행 날짜 | 2026-09-26 |
| 시작 날짜 | 2026-09-26 |
| 기한 | 없음 (Lowest — 순서가 밀려도 된다) |
| 선행 | 없음 |
| Jira | **없음 — 의도적으로 올리지 않았다.** 혹시 몰라서 기록만 남겨 두는 항목이고 중요하지 않다. 보드에 올리면 "밀린 일"처럼 보여 오히려 목록을 흐린다(결정 2026-09-26) |
| 발견 시점 | 2026-09-26 백엔드 전수 감사(탐색 6영역 → 검증 4영역). 하 등급 22건 중 당연히 고칠 10건은 `fix(be)/audit-low-batch-2026-09-26`로 처리했고, 이 12건은 실제로 문제가 나려면 특정 조건이 겹쳐야 하거나 고치는 비용이 얻는 것보다 크다 |
| 중요도 | **Lowest** |

## 왜 남겨 두기만 하는가

전부 검증 에이전트가 "실제 결함"으로 확인한 것이지만, 지금 규모(사용자 수십 명, 관리자 1명)에서는 발생 조건이 성립하지 않거나 결과가 사소하다. 규모가 바뀌면(사용자 수천 명, 관리자 여러 명, 정산 시작) 그때 꺼내 본다. 그 전에 손대는 것은 회귀 위험만 산다.

## 항목

### 지금 규모에선 안 해도 되는 것 — 8건

| # | 문제 | 위치 | 언제 의미가 생기는가 |
|---|---|---|---|
| 1 | `sessions` 파기 쿼리(`revoked_at < ? OR expires_at < ?`, 매시간)에 인덱스가 없다 | `auth/session.repository.ts` `deleteInactiveBefore` · `session.entity.ts` | 사용자 수천 명(리프레시마다 행이 늘어 수백만 행) — `(expires_at)`·`(revoked_at)` 인덱스 마이그레이션 |
| 2 | 리프레시 회전이 `revokeIfActive` UPDATE → `issueSession` INSERT로 트랜잭션 없이 이어진다 | `auth/services/auth.service.ts` ~196-208 | INSERT 실패 순간에만. 결과는 그 기기 재로그인 1회(FE가 재시도하지 않아 전 기기 로그아웃 연쇄는 없음). `SessionRepository`가 manager를 받으므로 `dataSource.transaction`으로 감싸면 끝 |
| 3 | 파일만 반영(`applyFilesOnly`)·회수·복구가 `contents` 행을 잠그지 않고 저장한다 | `admin/services/admin-content.service.ts` ~515, ~706, ~773 | 관리자 1명이 같은 콘텐츠에 [반영]과 재발행을 같은 초에 눌러야 함. 세 경로에 `getByIdForUpdate` |
| 4 | 주제 삭제가 잠금 없이 건수를 세어 동시 업로드와 겹치면 FK 위반 500 | `admin/services/admin-topic.service.ts` ~154-161 | 같은 조건. `FOR NO KEY UPDATE`로는 안 닫힘(FK 검사의 `FOR KEY SHARE`와 충돌 안 함) — `FOR UPDATE` 또는 23503 → 409 변환 |
| 5 | 월 잠금(1일 04:00) 뒤 적산되는 `listened_sec`이 확정된 month 행에 반영되지 않아 `all` 합에서 빠진다 | `playback/repositories/play-record.repository.ts` ~83-106 · `content-stat-aggregation` `is_final` | 파트너 정산 시작 뒤. 경계를 걸친 세션의 초 단위. 전달 확정을 하루 늦추면 대부분 해소 |
| 6 | `Idempotency-Key` 길이 미검증 — 256자 초과가 Postgres 22001 → 500 `INTERNAL_ERROR` | `idempotency/idempotency.interceptor.ts` ~93 | 정상 클라이언트(36자 UUID)는 못 만드는 요청. `MaxLength(255)` → 400 |
| 7 | 본문 413(`entity.too.large`)이 `HttpException`이 아니라 500 + Sentry로 처리 | `common/filters/all-exceptions.filter.ts` ~143-153 | 기본 100kb를 넘는 비정상 요청만. 숫자 `status`가 있는 raw 에러를 4xx로 매핑하는 분기 하나 |
| 8 | `notification_logs.sent_at`·receipt 대기 기준 시각이 실제 발송 시각이 아니라 배치 시작 `now` | `drip-batch.orchestrator.ts` ~126,196 · `drip-arrival-notification.service.ts` ~154,249 | 배치가 수십 분 걸릴 때 지표 정확도만. 기능 영향 없음(receipt는 다음 틱에 다시 묻는다) |

### 안 해도 되는 것 — 4건

| # | 문제 | 위치 | 안 하는 이유 |
|---|---|---|---|
| 9 | 삭제 실행취소 뒤 `delete`(−0.6) 신호가 남고 7일 뒤 `ignore`(−0.3)가 다시 파생된다 | `library-screen.orchestrator.ts` ~220-236 · `library.service.ts` restore · `library-item.repository.ts` ignore 쿼리 | 5초 취소 창 + 7일 방치가 겹쳐야 하고 결과는 가중치 −0.3(스쿼시 뒤 미세). 원하면 restore 때 delete 신호 삭제 또는 ignore 쿼리에서 delete 신호 보유 콘텐츠 제외 |
| 10 | 클러스터 프라이머리가 죽은 워커를 백오프·상한 없이 즉시 다시 띄운다 | `cluster.ts` ~48-65 | env 오류는 프라이머리가 import 시점에 먼저 죽어 Docker 재시작으로 감. DB 다운은 Nest 재시도 뒤 abort → 약 25초 주기 재포크, 자가 복구. 남는 건 깨진 빌드의 워커 전용 부팅 버그뿐인데 그건 CI 검증 job이 막는다. 원하면 연속 빠른 종료 N회면 프라이머리가 비정상 종료 |
| 11 | 배치가 미리보기 표시용 `findRecentDripTopicIds` 쿼리 2개를 사용자마다 실행한다 | `drip-batch.orchestrator.ts` ~611-615 | 사용자당 수 ms. `PlanOptions` 플래그로 미리보기만 조회하게 하면 됨 |
| 12 | `POST /auth/pipeline-login`에 인증 라우트 한도(`@Throttle(AUTH_THROTTLE)`)가 없다 | `auth/auth.controller.ts` ~70-81 | HS256 비밀 32바이트·유효 2분이라 온라인 추측이 불가능. 전역 한도(150/분/워커)는 받는다. 일관성 문제만 — architecture.md 9.6에 이미 "하 등급"으로 적혀 있다 |

## 완료 조건

이 티켓은 **처리하지 않는 것이 기본**이다. 아래 중 하나가 되면 해당 행을 꺼내 별도 티켓으로 올린다.

- Given 활성 사용자 1,000명 도달 / When 이 문서를 본다 / Then 1·2번을 티켓으로 올린다
- Given 관리자 계정이 2명 이상 / When 이 문서를 본다 / Then 3·4번을 티켓으로 올린다
- Given 파트너 정산 시작 / When 이 문서를 본다 / Then 5번을 티켓으로 올린다
- Given 6~12번 / When 관련 코드를 다른 이유로 고친다 / Then 그 PR에서 함께 정리하고 이 표에서 지운다

## 처리 기록

- 2026-09-26 발행. Jira 미반영(의도). 하 22건 중 10건은 같은 날 `fix(be)/audit-low-batch-2026-09-26`에서 처리.
