# [BE] domain.md — `device_tokens.token`의 NULL 허용 명시

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/domain.md` |
| 위치 | 3.6 `device_tokens` |
| 요청 파트 | 백엔드 |
| 관련 작업 | 온보딩 백엔드 구현 (`feat(be)/onboarding`) |

> **참고** — `domain.md`는 backend 소유 문서라 백엔드가 직접 고칠 수 있는 대상이다. 다만 **스키마의 유일한 기준**이라 임의로 손대지 않고 여기에 남긴다. 승인해 주면 문서를 바로 고치겠다.

## 어긋난 지점

**`domain.md` 3.6** — `token`에 NULL 표기가 없다. 이 문서는 nullable 컬럼에 `NULL`을 명시하는 규칙(`invalidated_at NULL`)을 쓰므로, 표기가 없으면 NOT NULL이다.

```
device_tokens
  token                       varchar
  invalidated_at              timestamptz   NULL
```

**`onboarding-api.md` 4.9** — 권한을 거부하면 `push_token`을 `null`로 보내도록 확정돼 있다.

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `push_token` | string | 조건부 | 권한이 거부되면 `null`. 발급받지 못한 토큰을 만들어 보내지 않는다 |

같은 절이 그 이유도 적고 있다.

> **거부했을 때도 호출한다.** 호출하지 않으면 서버는 "거부"와 "아직 안 물어봄"을 구분할 수 없어, 발송 대상 판정과 재노출 판단의 근거가 사라진다.

## 왜 문서 쪽을 고쳐야 하는가

`token`이 NOT NULL이면 **권한을 거부한 기기의 행을 아예 만들 수 없다.** 그러면 위 문장이 요구하는 "거부 / 아직 안 물어봄" 구분이 성립하지 않는다.

우회하려면 빈 문자열이나 더미 토큰을 넣어야 하는데, 그건 `domain.md` 3.1이 `nickname`에 대해 배제한 방식과 같은 문제다 — **"값이 없음"과 "그 값으로 정해짐"이 구분되지 않는다.** 발송 대상을 고를 때 빈 문자열을 걸러내는 조건이 코드 여기저기로 번진다.

## 제안 문구

```
device_tokens
  token                       varchar       NULL 허용 (권한 거부 — 발급받지 못함)
```

설명 줄 추가:

> - **`token`은 NULL을 허용한다.** OS 알림 권한을 거부한 기기는 토큰을 발급받지 못하지만, **거부했다는 사실 자체를 기록해야** 발송 대상 판정과 재노출 판단이 가능하다(`onboarding-api.md` 4.9). 만들어 낸 값이나 빈 문자열을 넣지 않는다 — "없음"과 "그 값으로 정해짐"이 구분되지 않게 된다(3.1 `nickname`과 같은 이유).

## 서버 구현 상태

**클라이언트 계약을 따라 nullable로 구현했다**(`backend/src/modules/user/entities/device-token.entity.ts`). 마이그레이션 `AddOnboardingTables`에도 nullable로 들어가 있다. 문서를 반대로(NOT NULL 유지) 확정하면 엔티티·마이그레이션과 `onboarding-api.md` 4.9를 함께 고쳐야 하므로, **문서 결정을 먼저 받는 편이 낫다.**
