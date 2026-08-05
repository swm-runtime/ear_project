# [BE] onboarding-api.md — 계약 충돌 1건 정정 + 미결 사항 3건 해소

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/onboarding-api.md` |
| 위치 | 7장 · 9장 (아래 항목별 표기) |
| 요청 파트 | 백엔드 |
| 관련 작업 | 온보딩 백엔드 구현 (`feat(be)/onboarding`) |

---

## 1. 7장 — `topic_ids` 배열 상한 3건은 **에러 코드 계약과 충돌한다** (정정 필요)

**현재 문장** (7장 보안·검증 규칙)

> **배열 필드에 길이 상한을 강제한다** — `topic_ids` 3건, `content_ids` 9건.

**문제**

`topic_ids`를 DTO 검증 단계에서 3건으로 자르면 4개를 보낸 요청은 `VALIDATION_FAILED`(400)가 된다. 그런데 같은 문서 4.3과 5장은 그 상황을 **`ONBOARDING_INTEREST_LIMIT_EXCEEDED`** 로 내리도록 정하고 있다. 두 규칙을 동시에 만족시킬 수 없다.

| 문서 위치 | 4개 전송 시 기대 |
|---|---|
| 4.3 에러 표 · 5장 에러 코드 표 | `ONBOARDING_INTEREST_LIMIT_EXCEEDED` (400) |
| 7장 배열 상한 3건 | `VALIDATION_FAILED` (400) |

`onboarding.md` 8의 완료 조건이 **"클라이언트를 우회해 주제 4개를 서버로 보낸다 / Then 서버가 상한을 검증해 거부한다"** 이고, 클라이언트는 이 코드로 "3개까지 선택할 수 있어요" 토스트를 띄운다(5장). 따라서 **에러 코드 쪽이 계약이고 7장 문장이 정정 대상**이다.

**제안 문구**

> - **배열 필드에 길이 상한을 강제한다** — `content_ids` 9건.
> - **`topic_ids`의 도메인 상한(3건)은 DTO가 아니라 Service가 검증한다.** DTO 검증은 `VALIDATION_FAILED`로 뭉뚱그려지므로 `ONBOARDING_INTEREST_LIMIT_EXCEEDED`와 `ONBOARDING_INTEREST_REQUIRED`를 구분해 내려줄 수 없다(4.3·5장). DTO에는 대량 쓰기를 막는 **안전 상한**만 둔다.

**서버 구현 상태** — 위 제안대로 구현했다. DTO는 안전 상한 20건, 도메인 상한 3건은 `UserInterestService`가 판정한다. 4개를 보내면 `ONBOARDING_INTEREST_LIMIT_EXCEEDED`가 나가는 것을 실행해 확인했다.

---

## 2. 9장 미결 — "첫 드립 편성 작업의 상태를 담을 자리가 없다(P0)" **해소**

**현재 문장**

> **첫 드립 편성 작업의 상태를 담을 자리가 없다 — P0.** 4.8이 내려주는 `pending` · `queued` · `no_candidates`를 판정하려면 사용자 단위 편성 시도의 상태·재시도 횟수가 남아야 하는데, `drip_batch_runs`는 `run_date` 유니크의 일 배치 단위라 온보딩 트리거를 표현하지 못한다. (…) 사용자 단위 편성 작업 테이블을 둘지, 아니면 큐 도입과 함께 정할지 결정해야 한다.

**해소 근거**

`domain.md` 7.4에 **`first_drip_jobs`가 이미 정의돼 있다.** 이 문서가 요구하는 것을 그대로 갖고 있다.

```
first_drip_jobs
  user_id            uuid   FK → users   (uq_first_drip_jobs_user_id — 사용자당 1행)
  status             enum   pending | completed | no_candidates | queued | failed
  attempt_count      smallint    서버 내부 재시도 횟수
  last_attempted_at  timestamptz
  completed_at       timestamptz
  item_count         int         실제로 적립된 편수

idx_first_drip_jobs_status_last_attempted_at (status, last_attempted_at)
```

- 4.8의 네 상태(`pending` · `completed` · `no_candidates` · `queued`)가 그대로 `status` enum에 있다.
- `uq_first_drip_jobs_user_id`가 완료 요청 재시도로 인한 **중복 편성 트리거를 막는 최종 방어선**이다.
- `item_count`가 4.8의 `library_item_count`다.

**제안** — 9장의 이 항목을 지우고, 4.8에 다음 한 줄을 남긴다.

> 상태의 저장소는 `first_drip_jobs`다(`domain.md` 7.4). 완료 처리(4.7)와 같은 트랜잭션에서 행을 만들고, 편성은 커밋 이후에 시작한다.

**서버 구현 상태** — `first_drip_jobs` 기준으로 구현·검증 완료. 0건 담기 경로에서 `pending → completed`, 후보 고갈 시 `no_candidates`, 재시도 소진 시 `queued`가 나가는 것을 확인했다.

---

## 3. 9장 미결 — "서버 비동기 재시도 큐의 구현 방식 미결" **해소**

**현재 문장**

> **서버 비동기 재시도 큐의 구현 방식 미결.** `onboarding.md` 4가 재시도 소진 후 편성을 넘길 대상으로 지목한 큐가 아직 없다(DB 작업 테이블 + 스케줄러 vs BullMQ — `architecture.md` 미결 사항).

**결정** — **DB 작업 테이블 + 스케줄러**로 확정했다. `docs/backend/architecture.md` 미결 사항에 결정 사유와 구현 규칙을 기록했다(이 커밋에 포함).

- 별도 큐 인프라(Redis·BullMQ)를 두지 않는다. 대상이 방금 가입한 사용자 1명 단위의 작업이고 대기 구간이 십수 초라, 인프라를 하나 더 늘려 얻을 것보다 운영·장애 지점이 늘어나는 비용이 크다.
- `first_drip_jobs`가 작업 테이블이고, 주기 스케줄러가 `status IN (pending, queued)`인 오래된 행을 선점해 다시 시도한다. 선점은 `FOR UPDATE SKIP LOCKED`로 원자적으로 한다(다중 인스턴스 대비).
- 누적 시도 횟수를 소진하면 `failed`로 두고 운영 알림에 맡긴다.

**클라이언트 계약에는 변화가 없다.** 4.8의 `queued`는 여전히 "서버가 자체 재시도를 끝냈다"는 종료 상태이고, 클라이언트는 완료 화면 + 라이브러리 "콘텐츠를 준비하고 있어요" 배너로 진행한다.

**제안** — 9장의 이 항목을 지우고 `architecture.md`를 참조로 남긴다.

---

## 4. 9장 미결 — "기준값 확정" 중 서버가 소유하게 된 값 (참고)

현재 서버가 상수로 들고 있는 값이다. **전부 서버 설정이라 앱 배포 없이 바꿀 수 있고**, 4.7 응답으로 클라이언트에 내려간다. 문서의 미결 상태는 유지하되, 현재 값이 무엇인지만 기록해 두면 조정 논의가 쉬워진다.

| 값 | 현재 | 소유 위치 |
|---|---|---|
| 월간 표본 문턱 | 재생 30건 | `content.constant.ts` |
| 첫 드립 대기 상한 | 15초 | `onboarding.constant.ts` (4.7 응답 `max_wait_sec`) |
| 폴링 간격 | 1초 | `onboarding.constant.ts` (4.7 응답 `poll_interval_sec`) |
| 담기 상한 | 9건 | `onboarding.constant.ts` |
| 서버 내부 재시도 | 최대 2회 · 백오프 1초 → 3초(지터 ±20%) | `drip.constant.ts` |

**"대기가 끝나면 반드시 완료 화면으로 진행한다"는 규칙은 이 값들과 무관하게 유지된다.**
