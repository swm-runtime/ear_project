# [BE] 재발행 후 낡은 재생 위치가 그대로 내려온다 — 폐기 주체가 없다

| 항목 | 값 |
|---|---|
| 대상 | `playback_progresses` · `GET /contents/:id/audio-urls`(player-api 4.1) · `PATCH /admin/contents/:contentId`(admin-api 4.10) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | `tickets/backend/archive/content-republish-audio.md`의 "프론트 확인 항목"을 확인하다가 — FE 코드 조사 결과 폐기 주체가 아무 데도 없었다 |
| 근거 문서 | `features/player.md` 7 · `spec/api/player-api.md` 4.1·4.3 · `features/admin.md` 4.3 |
| 심각도 | **중** — 사용자가 새 오디오의 엉뚱한 지점에서 재생을 시작한다. 데이터 손상은 아니다 |
| 상태 | 반영 완료 (2026-09-07 — 안 A) |
| 연관 | `tickets/frontend/pending/republish-version-gate-not-implemented.md` — FE의 죽은 분기·사실이 아닌 주석 정리(해결 자체는 이 티켓) |

## 문제

`player.md` 7과 `player-api.md` 4.1은 이렇게 정한다.

> 클라이언트는 버전이 달라지면 **저장된 재생 위치와 오프라인 파일을 폐기한다.**
> `content.content_version` — 클라이언트가 **보관한 값**보다 크면 저장된 위치를 폐기하고 0부터 재생한다.

**클라이언트에는 보관한 값이 없다.** 프론트는 재생 위치를 로컬에 저장하지 않는다 —
`playback.store.ts`는 persist 미들웨어가 없는 순수 Zustand 스토어이고, `storage-keys.ts`가 가진
키는 토큰 2종·기기 ID·재생 확인 억제 날짜·최근 검색어뿐이다. 위치는 **매 진입마다 서버 4.1
응답에서 받는다.** 그래서 "보관값과 비교해 폐기한다"는 규칙은 클라이언트가 수행할 수 없다.

결과적으로 재발행 후 이렇게 된다.

| 경로 | 지금 |
|---|---|
| 위치 **저장**(4.3) | ✅ 막힌다 — `playback-progress.service.ts:64`가 버전 불일치 저장을 버린다. 낡은 `max_reached_sec`으로 가짜 완청이 나지 않는다 |
| 위치 **읽기**(4.1) | ❌ 안 막힌다 — `playback_progresses` 행이 남아 있고, 재발행 이전 위치가 그대로 내려간다 |

유일한 방어는 `playback.service.ts:221`의 "위치 ≥ 새 길이면 0" 폴백이라 **길이가 짧아진 재발행만**
걸린다. 이번 TTS 규격 변경(콜드오픈 폐지 · 앞뒤 무음 2초 · 1.2배속 — PR #155)은 길이가 늘 수도
줄 수도 있고, 늘어난 쪽은 그대로 통과한다. 게다가 콜드오픈이 사라지면 **같은 초가 다른 내용을
가리킨다** — 길이가 같아도 위치는 의미를 잃는다.

오프라인 파일은 해당 없다. 기능 자체가 없다(P1 이연 — `offline-download.md`).

## 요청 내용

**폐기 주체를 서버로 확정하고 구현한다.** 판정은 서버가 하고 클라이언트는 표시만 한다(공통 원칙).
클라이언트에 로컬 저장을 새로 넣는 것은 같은 규칙을 두 곳에 두는 일이고, 위치의 단일 진실은
`playback_progresses`다(`domain.md` 14장).

방법은 둘 중 하나이며 **선택이 필요하다.**

### 안 A — 재발행 시 그 콘텐츠의 `playback_progresses`를 지운다 (재발행 트랜잭션 안)

- 장점: 이후 경로가 전부 자연스럽다. 4.1은 `progress: null`을 내려주고 클라이언트는 0부터 재생한다.
  추가 계약 변경이 없다.
- 단점: **`content-republish-audio.md`의 완료 조건 "`playback_progresses` 행이 그대로 남아 있다"와
  충돌한다.** 그 조건은 "회수 후 재업로드와 달리 참조가 끊기지 않는다"를 확인하려는 것이었는데,
  행 유지가 그 자체로 목적이었는지 확인이 필요하다. `library_items`는 어느 안에서도 유지된다.
- 되돌릴 수 없다 — 지운 위치는 복구되지 않는다. 재발행이 잦지 않으므로 수용 가능해 보인다.

### 안 B — `playback_progresses`에 `content_version`을 갖고, 4.1이 낡은 행을 무시한다

- 장점: 행이 남는다. "언제 것인지"가 데이터에 남아 사후 판단이 가능하다.
- 단점: **`domain.md` 6.2 스키마 변경 + 마이그레이션**이 필요하고, `domain.md`는 다른 파트가
  소유한 기준 문서다. 4.1의 `progress` 필드 서술도 바꿔야 한다.

**안 A를 제안한다** — 스키마를 건드리지 않고, 남겨 봐야 쓸 데가 없는 값이다.

## 참고 — 지금 상태

- 재발행 엔드포인트는 2026-09-07 구현·검증 완료(`tickets/backend/archive/content-republish-audio.md`).
- 저장 경로의 버전 가드는 **이미 있다.** 이 티켓은 읽기 경로만 다룬다.
- FE 코드 수정은 **동작에 대해서는** 필요 없다 — 어느 안이든 서버에서 끝난다. 다만 FE에 재발행 폐기를 수행한다고 주장하는 죽은 분기와 주석이 남아 있어 별도 티켓으로 분리했다(위 연관).

## 완료 조건

- Given 5분 지점까지 들은 콘텐츠 / When 관리자가 그 콘텐츠를 재발행한다 / Then 다음 진입의 4.1 응답이 재발행 이전 위치를 내려주지 않는다
- Given 같은 상황 / When 사용자가 다시 재생한다 / Then 0부터 시작한다
- Given 같은 상황 / When 라이브러리를 본다 / Then 그 콘텐츠가 그대로 있다(담기가 풀리지 않는다)
- Given 재발행되지 않은 콘텐츠 / When 진입한다 / Then 저장된 위치가 그대로 복원된다(회귀 없음)

## 처리 기록 (반영 날짜: 2026-09-07)

**안 A로 구현했다** (PR #165 — `feat(be)/be-pending-tickets`). 재발행 트랜잭션 안에서 그
콘텐츠의 `playback_progresses`를 전부 삭제한다.

- `AdminContentService.republish` → `PlaybackService.deleteProgressesByContentId(contentId, manager)`
  (admin 모듈에 `PlaybackModule` 의존 추가 — playback은 admin을 모르므로 순환 없음).
- 검증 거부(회수 상태 409 등)로 재발행이 실패하면 삭제도 일어나지 않는다(트랜잭션 안 + 단위 테스트).

### 완료 조건 대조

| 조건 | 확인 |
|---|---|
| 재발행 후 4.1이 낡은 위치를 내려주지 않는다 | ✅ 행 자체가 삭제돼 `progress: null` |
| 다시 재생하면 0부터 | ✅ 위와 동일 근거 |
| 라이브러리는 그대로(담기 유지) | ✅ `library_items` 무접촉 — 단위 테스트로 고정 |
| 재발행 안 된 콘텐츠는 위치 복원(회귀 없음) | ✅ 로컬 DB 실측 — 대상 `content_id` 행만 지워지고 다른 콘텐츠 행 유지 |

### 안 선택 근거 (2026-09-07 확정)

- 안 A: 스키마·계약 무변경, 이후 경로가 전부 자연스럽다. 지운 위치는 복구 불가지만 새
  오디오에서 옛 위치는 무의미한 값이다.
- `content-republish-audio.md` 완료 조건("행이 그대로 남아 있다")과의 표면 충돌은, 그 조건의
  취지가 "참조(라이브러리·재생 기록)가 끊기지 않는다"였고 그것은 유지되므로 문제없다고 판정.

### 남긴 것

- 문서 현행화는 `changes/pending/player-republish-progress-discard-owner.md`로 발행
  (`player.md` 7 · `player-api.md` 4.1 · `admin-api.md` 4.10 — 폐기 주체 서버로).
- FE의 죽은 분기·주석 정리는 연관 티켓(`tickets/frontend/pending/republish-version-gate-not-implemented.md`) 몫 그대로.
