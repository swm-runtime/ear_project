# [문서] 코드 점검에서 드러난 `domain.md` · `convention.md` 어긋남 정리

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/backend/domain.md` 3.1 · 6.5 · 12.3 · `docs/backend/convention.md` 8.1 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-08 |
| 반영 날짜 | 2026-09-08 (같은 날 반영) |
| 발견 시점 | 2026-09-08 백엔드 코드 전수 점검 — 마이그레이션·엔티티를 문서와 기계 대조하면서 |
| 심각도 | 하~중 — 동작 버그는 없다. 다만 넷 다 **다음 사람이 잘못 구현할 근거**가 된다 |

## 1 · `12.3` 즉시 파기 목록에 `audio_access_logs`가 없다 (중)

이 테이블은 `user_id` · `device_id` · `ip_hash`를 갖는데 12.3의 세 목록(즉시 파기 / 아카이브 / 그대로 유지) **어디에도 없었다.**

실제로는 FK의 `ON DELETE CASCADE`가 지우고 있어 **동작은 옳다.** 다만 그것이 **명세된 결과가 아니라 우연**인 상태였다 — 누군가 CASCADE를 떼면 개인정보가 남고, 그게 규칙 위반인지 판단할 근거가 문서에 없다.

→ 즉시 파기 목록에 추가하고, 6.5에도 "탈퇴 시 즉시 파기 · CASCADE가 집행한다"를 적었다.

## 2 · `6.5` `ip_hash`의 NULL 허용이 표기되지 않았다 (하)

코드는 IP를 읽지 못하면 `null`을 넣는다(`TRUST_PROXY_HOPS`가 0인 배포). 스키마도 NULL 허용인데 문서 표기에만 없었다.

→ `NULL 허용`을 표기하고 이유(빈 값을 해싱해 실제와 구분되지 않는 값을 만들지 않는다)를 적었다.

## 3 · `3.1` `users.status` · `withdrawn_at`은 쓰이지 않는 컬럼이다 (중)

3.1은 `status enum active | withdrawn`, `withdrawn_at`, `idx_users_status`를 정의한다. 그런데 **어떤 코드도 두 컬럼에 쓰지 않는다** — 12.3이 "`users` 행은 **삭제한다.** `status = withdrawn`으로 남겨두지 않는다"로 정했기 때문이다.

**두 절이 서로 반대를 말하고 있다.** 3.1만 보고 소프트 삭제를 구현하면 개인정보보호법 제21조 제3항의 분리 저장 요건이 깨진다.

→ 컬럼은 남기되 **"여기에 소프트 삭제를 구현하지 않는다"** 를 명시하고, 정리 여부를 미결로 달았다. 지우려면 마이그레이션이 필요해 이번 범위 밖이다.

## 4 · `convention.md` 8.1이 자기모순이다 (중)

같은 절 안에서 **예제 코드는 camelCase**, **공통 필드 표와 8.3 필수 필드는 snake_case**를 쓴다.

```ts
// 예제 (개정 전)
this.logger.warn('play blocked by daily limit', { userId, contentId, playCount });
```
```
// 같은 절의 공통 필드 표
user_id | 인증된 요청인 경우
// 8.3 정책 판정 필수 필드
error_code, tier, play_count
```

그래서 코드도 갈렸다 — 다수는 `user_id`, 일부는 `userId`. **같은 뜻의 값이 두 이름으로 쪼개져 집계가 갈린다.**

→ 표가 규범이고 코드 다수도 그쪽이므로 **snake_case로 확정**하고, 예제를 고치고, "코드가 camelCase여도 로그 필드는 바꿔 담는다"를 규칙으로 명시했다. 코드 쪽 정리는 같은 날 반영했다.

## 완료 조건

- Given `domain.md` 12.3 즉시 파기 목록 / When 읽는다 / Then `audio_access_logs`가 있다
- Given `domain.md` 6.5 / When `ip_hash` 행을 본다 / Then NULL 허용이 표기돼 있다
- Given `domain.md` 3.1 / When `status`를 본다 / Then 쓰이지 않는다는 것과 소프트 삭제를 구현하면 안 되는 이유가 적혀 있다
- Given `convention.md` 8.1 / When 예제와 표를 함께 읽는다 / Then 표기가 일치한다
