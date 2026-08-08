# [BE] common-error-handling.md — 9.8의 "enum에 아직 없다" 문장이 사실과 다르다

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/features/common-error-handling.md` |
| 위치 | 9.8 "이 표를 읽는 규칙" — 마지막 불릿 |
| 요청 파트 | 백엔드 |
| 관련 작업 | 프로필 백엔드 구현 (`feat(be)/profile`) — 탐색 구현(`feat(be)/explore`) 시점부터 절반은 이미 어긋나 있었다 |
| 근거 문서 | `docs/backend/architecture.md` 7.5(코드 추가 시 9장 표를 먼저 갱신한다) |
| 성격 | **사실 오류.** 계약이 바뀌는 것이 아니라 문서의 서술이 코드보다 뒤처졌다 |
| 상태 | 대기 |

> **FE 대응은 없다.** 에러 코드 값·HTTP 상태·클라이언트 동작이 하나도 바뀌지 않는다. "서버 enum에 그 코드가 있는가"라는 **서버 사실관계**를 적은 문장이라 통신 규격 밖이다.

---

## 어긋난 지점

9.8의 마지막 불릿이 이렇게 남아 있다.

> **`EXPLORE_CURSOR_INVALID` · `STATS_WEEK_OUT_OF_RANGE`는 계약만 있고 서버 enum에는 아직 없다.** 탐색·프로필이 구현되지 않았기 때문이며, 구현 시 enum에 추가한다. 나머지 40개는 `error-code.enum.ts`와 1:1로 일치한다.

두 코드 모두 **이미 enum에 있다.**

| 코드 | enum 추가 시점 | 쓰는 곳 |
|---|---|---|
| `EXPLORE_CURSOR_INVALID` | 탐색 백엔드 구현 (`feat(be)/explore`, PR #17) | `GET /explore/contents` · `GET /explore/popular`의 커서 지문 불일치 |
| `STATS_WEEK_OUT_OF_RANGE` | 프로필 백엔드 구현 (`feat(be)/profile`) | `GET /users/me/profile/weekly-listening`의 가입 주 이전·미래 주 |

`error-code.enum.ts`의 현재 코드 수는 **42개**이며, 9장 표와 1:1로 일치한다(40 + 위 2개).

**이 문서가 스스로 "9장 표가 원본이고 api 문서 5장은 발췌다"라고 선언하고 있다**(`architecture.md` 7.5도 같은 순서를 정한다). 원본이 "아직 없다"고 말하는 코드로 서버가 이미 응답하고 있으면, 다음 사람이 enum을 추가하려다 이미 있는 것을 발견하거나 반대로 없다고 믿고 우회 코드를 만든다.

## 제안 문구

마지막 불릿을 아래로 교체한다.

> - **9장 표의 42개는 `error-code.enum.ts`와 1:1로 일치한다.** 탐색(`EXPLORE_CURSOR_INVALID`)·프로필(`STATS_WEEK_OUT_OF_RANGE`)이 구현되면서 마지막까지 남아 있던 두 코드가 enum에 등재됐다. 앞으로 코드를 추가할 때는 `architecture.md` 7.5의 순서를 따른다 — **enum → 9장 표 → 해당 `spec/api/*-api.md` 5장.**

앞의 세 불릿(`retryable: true`의 범위 / 설정 화면은 고유 코드 없음 / api 문서가 없는 화면은 작성 시 등재)은 **그대로 둔다.** 셋 다 여전히 유효하다.

## 서버 구현 상태

**문서만 고치면 된다. 코드는 바꿀 것이 없다.**

- `backend/src/common/exceptions/error-code.enum.ts` — 42개 등재 완료
- 두 코드 모두 실제 응답으로 확인했다
  - `EXPLORE_CURSOR_INVALID` — 구간이 바뀐 커서 재사용 시 400(탐색 통합 테스트, 2026-08-08)
  - `STATS_WEEK_OUT_OF_RANGE` — 가입 주 이전·미래 주 조회 시 400(프로필 구현 확인, 2026-08-08)

## 함께 확인할 것

- **9.7 프로필 표는 손대지 않는다.** `STATS_WEEK_OUT_OF_RANGE` 한 행이 이미 올바른 내용(400 · `retryable: false` · "사용자에게 노출하지 않고 현재 표시 주 유지")으로 등재돼 있다. 고칠 것은 9.8의 서술뿐이다.
- **개수를 문장에 적는 방식 자체가 이런 밀림을 만든다.** "나머지 40개"처럼 숫자를 본문에 박아 두면 코드가 늘 때마다 문장이 틀린다. 교체 문구도 42라는 숫자를 담고 있으므로, 다음에 코드가 늘면 같은 수정이 또 필요하다 — 숫자를 빼고 "표와 enum은 1:1로 일치한다"로만 둘지는 문서 소유자가 판단한다.

## 완료 조건

- Given `common-error-handling.md` 9.8을 본다 / When 마지막 불릿을 읽는다 / Then "서버 enum에 아직 없다"는 서술이 사라지고, 표와 enum이 일치한다는 사실만 남아 있다
- Given 백엔드 개발자가 새 화면을 구현한다 / When 9.8을 읽는다 / Then 코드 추가 순서(enum → 9장 표 → api 문서 5장)를 그 자리에서 알 수 있다
- Given 9장 표의 코드를 세어 `error-code.enum.ts`와 대조한다 / When 양쪽을 비교한다 / Then 빠지거나 남는 코드가 없다
