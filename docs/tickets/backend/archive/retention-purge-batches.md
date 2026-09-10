# [BE] 보존 기간 배치 6종이 없다 — 기간은 정의됐는데 지우는 코드가 없다

| 항목 | 값 |
|---|---|
| 대상 | `user_signals` · `source_link_clicks` · `audio_access_logs` · `notification_logs` 보존 배치 · `created_at` 인덱스 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-10 |
| 발견 시점 | `changes/archive/retention-policy-gaps.md` 반영 — 기간을 `domain.md` 12.1에 확정하면서, **집행하는 코드가 없다**는 것이 남았다 |
| 근거 문서 | `backend/domain.md` **12.1**(확정 2026-09-10) · 12.3 |
| 심각도 | **하** — 지금 규모에서는 용량 문제가 없다. 다만 **문서가 정한 기간이 지켜지지 않는 상태**다 |
| 상태 | 대기 |

## 문제

`domain.md` 12.1에 네 테이블의 보존 기간이 확정됐다(2026-09-10). **그런데 그 기간을 집행하는 배치가 없다.**

지금 도는 정리 배치는 `idempotency_keys` 하나뿐이다(`idempotency-purge.scheduler.ts`, 2026-09-08 신설). 나머지는 **탈퇴 시 파기(12.3)만 있고 운영 중 삭제 경로가 없어 무기한 성장한다.**

| 테이블 | 확정 기간 | 성장 속도 |
|---|---|---|
| `user_signals` | 180일 | 재생·담기·완청마다 1행 |
| `source_link_clicks` | 180일 | 원문 클릭마다 1행 |
| `audio_access_logs` | 90일 | **서명 URL 발급마다** — 재생 중 5분 갱신 포함. 가장 빠르다 |
| `notification_logs` | 90일 | 발송마다 |

`audit_logs`는 **삭제하지 않고**(감사 증적), `play_records`는 **보류**다(프로필이 전 기간 합계를 읽는다) — 둘 다 이 티켓의 범위가 아니다.

## 요청 내용

1. **`idempotency-purge.scheduler.ts`와 같은 형태**로 배치를 둔다. 그 파일이 참고 구현이다 — `@Interval`, 실패 시 던지지 않음(던지면 스케줄러가 멈춘다), 삭제 건수만 로그.
   - 네 개를 각각 두지 말고 **한 스케줄러가 테이블별 기간 표를 순회**하는 편이 낫다. 기간이 `domain.md`에 표로 있으니 코드도 표로 두면 대조가 쉽다.
2. **`created_at` 인덱스를 먼저 확인한다.** `user_signals`·`audio_access_logs`에는 **단독 인덱스가 없다** — 삭제 쿼리가 풀스캔이 된다. 없으면 마이그레이션을 동반한다.
3. **한 번에 다 지우지 않는다.** 첫 실행은 몇 달치를 한꺼번에 지우게 되므로 배치 크기를 끊어(예: 10,000행) 반복한다. 큰 `DELETE` 하나는 락과 WAL을 오래 잡는다.

## 완료 조건

- Given 180일이 지난 `user_signals` 행 / When 배치가 돈다 / Then 삭제되고, 그보다 최근 행은 남는다
- Given 같은 배치 / When 두 번 연속 돈다 / Then 두 번째 실행이 아무것도 지우지 않는다(멱등)
- Given 배치가 실패한다 / When 로그를 본다 / Then 에러가 남고 **스케줄러는 계속 돈다**
- Given 삭제 쿼리 / When 실행 계획을 본다 / Then 풀스캔이 아니다
- Given `domain.md` 12.1 표 / When 코드의 기간 표와 대조한다 / Then 값이 일치한다

## 처리 기록 (2026-09-10 — 4종 구현, 3종은 범위 밖)

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-09-10 |
| 반영 날짜 | 2026-09-10 |

`Retention` 모듈을 신설해 `domain.md` 12.1이 정한 네 테이블의 보존 기간을 집행한다.

| 테이블 | 기간 | 12.1의 근거 |
|---|---|---|
| `user_signals` | 180일 | 스코어링 창은 90일. 두 배를 두는 것은 `content_stats` 재집계가 원천을 필요로 하기 때문 |
| `source_link_clicks` | 180일 | 같은 재집계 입력 |
| `audio_access_logs` | 90일 | 재생 중 5분마다 갱신 발급이 쌓여 성장이 가장 빠르다 |
| `notification_logs` | 90일 | 중복 발송 방지 창을 넘기면 쓰이지 않는다 |

`audit_logs`(삭제하지 않는다)와 `play_records`(보류)는 대상에서 제외했고, **둘이 목록에 들어오면 실패하는 테스트**를 뒀다.

### 티켓이 틀렸던 것 — 인덱스가 넷 다 없었다

티켓은 `user_signals` · `audio_access_logs` 둘만 `created_at` 인덱스가 없다고 적었는데, 실제로는 **네 테이블 모두 쓸 수 있는 인덱스가 없었다.** 기존 인덱스가 있어도 선행 컬럼이 다르거나(`(user_id, created_at)` · `(content_id, created_at)`) 시간 축 자체가 달라서(`issued_at` · `scheduled_at`) 삭제 조건에 닿지 않는다. 넷 다 추가했다.

`EXPLAIN`으로 실제 계획을 확인했다 — `Index Scan using idx_user_signals_created_at`, 풀스캔이 아니다.

### 구현하며 정한 것

- **`@Interval`이 아니라 `@Cron('30 4 * * *', Asia/Seoul)`.** 티켓은 참고 구현(`idempotency-purge.scheduler.ts`)의 형태를 그대로 쓰라고 했지만, 24시간 `@Interval`은 **기동 시점부터 세므로 배포가 잦으면 영영 돌지 않는다.** 참고 구현은 주기가 1시간이라 그 문제가 없다. 시각을 04:30으로 둔 것은 집계(04:00)·만료(04:10) **뒤**, 드립 편성(05:00) **앞**이기 때문이다 — `content_stats` 재집계가 `user_signals`를 원천으로 읽어서, 먼저 지우면 그날 집계가 원천을 잃는다.
- **04시 서비스 날짜 경계를 적용하지 않았다.** `domain.md` 1.2가 경계를 적용할 자리로 셋(`play_records.play_date` · `content_stats` 창 · `drip_batch_runs.run_date`)을 명시하는데 보존은 거기 없다. 보존은 "`created_at` 이후 N일 경과"라는 경과 시간이지 서비스 날짜 판정이 아니다.
- **배치 크기를 끊어 지운다.** 첫 실행이 몇 달치를 한 번에 지우면 테이블이 잠긴다. `DELETE ... LIMIT`을 TypeORM으로 표현할 수 없어 Repository에서 raw SQL을 쓴다(`architecture.md` 3.4의 허용 범위 — 테이블 이름은 컴파일 타임 문자열 유니온이라 사용자 입력이 식별자 자리에 닿지 않는다).
- **테이블 단위로 실패를 격리한다.** 하나가 실패해도 나머지는 계속 지우고, 스케줄러는 던지지 않는다.

### 완료 조건 확인 (실 DB)

`user_signals`에 12만 행을 넣고 실제로 돌렸다.

```
1회차: 120,000 → 100,000건 삭제(1만 배치 11회) → 20,000 잔존(창 안쪽은 살아남음)
2회차: 0건 삭제, 20,000 그대로            ← 재실행이 무해하다
notification_logs: 8 → 5건 삭제 → 3 잔존 → 2회차 0건
```

테스트 데이터는 전부 정리했다. 유닛 594건(신규 12건 포함) 통과.

### 함께 반영한 문서

`architecture.md` 4.5 의존 방향 표에 `Retention` 행을 넣었다 — 표가 "여기 없는 의존은 반려" 기준이라 새 모듈이 표 밖에 있으면 그 규칙이 첫 줄부터 지켜지지 않는다. 경위는 `changes/archive/retention-module-dependency-row.md`.

### 남은 것 (이 티켓 범위 밖)

`domain.md` 12.1이 함께 약속한 **`sessions` 30일 · `email_verifications` 만료 24시간 후 · `first_drip_jobs` 완료 30일 후**는 구현하지 않았다. 12.1의 "위 배치들은 아직 구현되지 않았다" 문장은 이 셋에 대해 여전히 참이다.
