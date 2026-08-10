# 플레이어 API 명세서

> 기준 문서: [`docs/features/player.md`](../../features/player.md)
> 판정 소유: [`docs/features/paywall.md`](../../features/paywall.md) 4.1~4.3-1 (재생 한도·차감·재청취 창)
> 재생 시작 계약 소유: [`docs/spec/api/library-api.md`](./library-api.md) 4.4
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 5~6장

## 1. 범위

`player.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 다루는 것은 다음 다섯이다.

- **재생 URL 발급** — 단기 서명 URL + 플레이어 진입에 필요한 메타(출처 고지·진행·라이브러리 상태)를 한 번에. 재생 중 URL 갱신도 같은 경로다
- **재생 시작**(`POST /contents/:content_id/play`)의 **플레이어 관점 사용** — 계약 자체는 `library-api.md` 4.4가 소유하며 이 문서는 호출 시점과 응답 사용만 서술한다
- **재생 위치 저장** — `position_sec` · `max_reached_sec` 갱신 + 실제 청취 시간(`listened_sec`) 적산 + **완청 판정(서버)**
- **`replay` 신호** 적재 — 완료 상태에서 위치 0 재생
- **원문 유입 클릭** 적재 — **라이브러리·탐색·플레이어 세 화면 공용 계약**(더보기 통일 확정 2026-08-10)

**이 문서는 동작 규칙을 새로 정하지 않는다.** 규칙이 충돌하면 `player.md`가 기준이며, 재생 허용 판정은 `paywall.md`가 기준이다. 스키마는 `domain.md`가 유일한 기준이다.

**다루지 않는 것** — 경계를 먼저 못 박는다.

| 대상 | 소유 문서 | 이 문서에서 하는 일 |
|---|---|---|
| 재생 한도 판정(`ALLOW` / `BLOCKED` / `LIMIT_REACHED`)·차감 단위·확인 팝업·재청취 창 15일 | `paywall.md` 4.1~4.3-1 | **참조만 한다.** URL 발급이 같은 판정을 재사용한다는 것과 그 결과의 표현만 정의한다 |
| 재생 시작 기록 — 카운트 적재·상태 전이(`unplayed` → `in_progress`)·드립 제외·`play` 신호 | `library-api.md` 4.4 | **재정의하지 않는다.** 4.2에서 호출 시점·응답 사용만 서술한다 |
| 완청 상태 전이의 **명시 트리거** 엔드포인트 | `library-api.md` 4.5 | `duration_sec`이 없어 서버가 90%를 판정할 수 없는 콘텐츠의 폴백 경로로만 참조한다(4.3) |
| 배속 저장(`user_settings.default_playback_rate`) | `settings-api.md` 4.2 | **그 계약을 그대로 호출한다.** 배속 시트(PL4)의 저장 요청을 여기서 재정의하지 않는다 |
| 수면 타이머(P1) — `sleep_timer_last_choice` 저장 | `player.md` 4.7 · `settings-api.md` 8장 | 값 집합이 미정이라(`domain.md` 3.5) **P1 구현 시 이 문서에 추가한다.** 조회·변경 모두 플레이어 소관이라는 경계만 확정이다 |
| 스크립트 조회(P1) — `content_scripts` | `player.md` 4.6 · `domain.md` 5.3 | P1 구현 시 추가한다. 접근 통제는 오디오와 동일해야 한다(`architecture.md` 9.4 — "오디오만 막고 텍스트를 열어두지 않는다") |
| **스킵 신호** | **존재하지 않는다** — 제거 확정 2026-08-10(`player.md` 4.4, `domain.md` 6.4 enum 반영 완료) | 엔드포인트도 필드도 두지 않는다. 초반 이탈은 어떤 요청으로도 표현되지 않는다 |
| 미니플레이어 복원 대상 조회 | `library-api.md` 4.3 | 참조만 한다. 복원 후 재생 시작은 4.2와 동일 경로다 |
| 더보기의 [라이브러리에서 삭제] | `library-api.md` 4.6 | 발급 응답의 `library_item.id`(4.1)로 그 계약을 호출한다. 삭제 후에도 화면·재생은 유지된다(`player.md` 7 — 확정 2026-08-10) |
| 오프라인 저장(P1) | `offline-download.md` | 엔드포인트를 정의하지 않는다 |
| 회수 콘텐츠 동기화(`GET /contents/withdrawn?since=`) | `partner-control.md` · `domain.md` 5.1 | 회수분의 발급 거부(403)만 정의한다 |

---

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` — 이 문서의 **모든 엔드포인트가 인증 필요** |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** (epoch 정수 금지) |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | **`replay` 신호(4.4)만 `Idempotency-Key` 필수.** 나머지는 결과가 수렴한다(3장 설계 메모) |

- 성공 응답에 공통 봉투를 씌우지 않는다. **성공은 HTTP 상태로, 실패는 에러 규격으로 판단한다.** 에러 응답은 `architecture.md` 7.4 규격이다.
- 클라이언트가 분기해야 하는 상황은 반드시 `error_code`로 구분한다. 403 하나에 페이월·한도 안내·회수가 겹친다(`convention.md` 5.4).

**서버가 받지 않는 값**

- **티어·잔여 횟수·억제 상태를 요청에 싣지 않는다.** 전부 토큰과 서버 조회로 도출한다(`architecture.md` 9.2 · `library-api.md` 2장과 동일).
- **완청 여부를 클라이언트가 선언하지 않는다.** 완청은 위치 저장(4.3)을 받은 서버가 `max_reached_sec`으로 판정한다(`player.md` 4.4). 클라이언트에는 완료를 선언할 수 있는 필드 자체가 없다.
- 전역 `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`)가 DTO에 없는 필드를 잘라낸다.

---

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
|---|---|---|---|---|---|
| 1 | POST | `/contents/:content_id/audio-urls` | 서명 URL 발급 + 진입 메타. **재생 중 갱신도 동일 호출** | 필요 | |
| 2 | POST | `/contents/:content_id/play` | 재생 시작 — **계약 소유: `library-api.md` 4.4.** 이 문서는 사용만 서술(4.2) | 필요 | |
| 3 | PUT | `/users/me/playback-progresses/:content_id` | 위치 저장 + `listened_sec` 적산 + 완청 판정 | 필요 | |
| 4 | POST | `/contents/:content_id/replay` | `replay` 신호 — 완료 상태에서 위치 0 재생 | 필요 | **필수** |
| 5 | POST | `/contents/:content_id/source-link-clicks` | 원문 유입 클릭 — **세 화면 공용** | 필요 | |

**설계 메모**

- **발급(1)에 메타를 동봉하고 조회 엔드포인트를 따로 두지 않는다.** 플레이어 진입은 "탭 후 2초 내 재생 시작"(PRD 7)이 목표이고, 진입이 요구하는 것은 언제나 메타 + URL 둘 다다(`player.md` 4.1 — "메타 + 재생 URL 요청"이 한 문장이다). 왕복을 나누면 진입마다 2회가 되고, 메타만 필요한 화면은 존재하지 않는다 — 목록 화면은 이미 목록 응답으로 메타를 갖고 있다.
- **발급이 GET이 아니라 POST인 이유** — 발급은 조회가 아니라 **기록이 남는 생성**이다. 호출마다 새 서명 URL이 만들어지고 `audio_access_logs`에 발급 행이 적재된다(`domain.md` 6.5). 또한 서명 URL이 담긴 응답은 중간 캐시에 남으면 그 자체가 유출 경로이므로, 캐시 가능성이 있는 GET을 피하고 응답에 `Cache-Control: no-store`를 강제한다(7장).
- **발급(1)과 재생 시작(2)을 합치지 않는다.** 차감은 **재생이 실제로 시작된 시점**에만 일어난다(`paywall.md` 4.3 — 로드 실패·즉시 취소까지 차감하면 사용자가 손해를 본다). 발급 시점에 카운트하면 오디오 준비에 실패한 재생이 차감되고, 반대로 발급을 재생 시작 뒤로 미루면 2초 목표가 깨진다. 두 시점은 다른 사건이므로 다른 요청이다.
- **발급도 한도 판정을 거치되 차감하지 않는다.** `architecture.md` 9.4가 발급 시점 재검증(구독·한도·회수)을 요구한다. 판정 함수는 재생 시작과 같은 것(`paywall.md` 4.1)이고, 발급은 그 결과로 허용·거부만 한다 — 판정 로직이 두 벌이면 발급은 되는데 재생은 막히는 어긋남이 생긴다.
- **위치 저장(3)이 PUT인 이유** — "이 값으로 하라"는 절대값 저장이라 같은 요청이 두 번 도착해도 위치·도달값의 결과가 같다. `listened_sec_delta`(적산분)가 함께 실리는 것은 예외적 비멱등 요소인데, 별도 엔드포인트로 나누면 5초 주기마다 왕복이 2회가 된다 — 한 요청에 싣고 중복 위험은 4.3과 9장(미결)에서 다룬다.
- **클라이언트가 보내는 신호는 `replay` 하나뿐이다.** `play`는 재생 시작(2)이, `complete`는 위치 저장(3)을 받은 서버가 적재한다. 범용 신호 엔드포인트(`POST .../signals { action }`)를 두지 않는 이유다 — action을 열어두면 클라이언트가 `complete`를 선언하는 경로가 계약으로 되살아난다(`library-api.md` 4.5가 막은 것과 같은 문제).
- **`replay`(4)와 원문 유입 클릭(5)은 `Idempotency-Key`가 필수다.** `user_signals`에는 중복을 막는 유니크 제약이 없고, 오프라인 큐의 소비 신호는 "전부 보존, 순서대로 전송"이라(`common-error-handling.md` 4.5) 응답 유실 후 재전송이 같은 신호를 두 번 적재한다. 중복 적재는 `content_stats.replay_count`(정산·지표 — `domain.md` 5.4)와 드립 스코어링을 부풀리는 부작용이므로 `Idempotency-Key` 필수 대상이다(`convention.md` 5.5 · `domain.md` 1.4). 발급(1)은 반복돼도 각 발급이 독립적으로 유효하고, 위치 저장(3)은 절대값이라 멱등키를 받지 않는다.
- **원문 유입 클릭(5)은 이 문서가 소유하는 세 화면 공용 계약이다.** [원문 보기]는 플레이어 화면 상시 노출(FR-12)과 라이브러리 L4·탐색 E12·플레이어 PL7 더보기에 모두 있다(확정 2026-08-10 — `changes/archive/more-sheet-source-link-unified(fe).md`). 진입점마다 경로를 나누면 `content_stats.source_link_click_count`가 경로별로 갈라진다 — 재생 시작이 화면 불문 한 엔드포인트인 것과 같은 이유다(`library-api.md` 3장).

---

## 4. 엔드포인트 상세

### 4.1 `POST /contents/:content_id/audio-urls`

서명 URL 발급. 플레이어 진입과 동시에 호출하고, **재생 중 만료가 임박하면 같은 호출로 갱신한다.**

**Request**

```json
{ "device_id": "<기기 식별자>" }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| device_id | string | 필수 | `audio_access_logs.device_id` 기록용(`domain.md` 6.5). 전달 방식은 인증 계열과 동일하다(`auth-api.md` — 본문 필드) |

**Response 201**

```json
{
  "content": {
    "id": "uuid",
    "title": "출근길 30분, 협상의 심리학",
    "author_name": "김이어",
    "source_name": "이어 스튜디오",
    "source_url": "https://...",
    "duration_sec": 1470,
    "thumbnail_url": "https://...",
    "content_version": 1
  },
  "library_item": { "id": "uuid", "status": "in_progress" },
  "progress": { "position_sec": 552, "max_reached_sec": 552 },
  "audio": {
    "url": "https://.../signed...",
    "expires_at": "2026-08-10T00:25:00Z",
    "expires_in_sec": 300
  }
}
```

| 필드 | 의미 |
|---|---|
| `content.source_url` | **`null`이면 [원문 보기]를 노출하지 않는다**(`player.md` 4.5 — `origin = ai_generated`는 선택 필드다, `domain.md` 5.1) |
| `content.content_version` | 재발행 판정용. 클라이언트가 보관한 값보다 크면 저장된 위치·오프라인 파일을 폐기하고 0부터 재생한다(`player.md` 7) |
| `library_item` | 라이브러리에 없는 콘텐츠면 **`null`**. `id`는 더보기의 삭제(`library-api.md` 4.6) 호출에, `status`는 완료 화면(PL3) 판단에 쓴다 |
| `progress` | `playback_progresses` 행이 없으면 **`null`** — 0부터 재생한다. `start_position_sec` 입력(`player.md` 3장)이 있으면 그것이 우선한다 |
| `audio.url` | 단기 서명 URL. **재생기에 전달하는 용도 외로 보관·기록하지 않는다**(7장) |
| `audio.expires_at` | 만료 시각(디버깅·로그 대조용) |
| `audio.expires_in_sec` | **갱신 스케줄링용.** 응답 수신 시점 기준 남은 초 |

- **`expires_in_sec`을 함께 내려주는 이유** — 갱신 타이밍을 `expires_at`과 기기 시계로 계산하면 기기 시각 오차·조작만큼 갱신이 빗나간다. 상대값이면 시계와 무관하게 수신 시점부터 세면 된다. 만료 **판정**은 어차피 스토리지가 서명으로 한다 — 클라이언트 값은 둘 다 스케줄링 힌트다.
- **오디오 메타에 원본 경로가 없다.** `contents.audio_path`는 응답에 절대 실리지 않는다(`domain.md` 5.1 — URL은 컬럼이 아니라 응답 DTO 필드).
- **`description`·`topic_ids`는 내려주지 않는다.** 플레이어 화면이 쓰지 않는 값이다(PL1~PL3). 필요해지는 화면이 생기면 그 화면 계약에 추가한다.

**서버 처리**

1. 콘텐츠 조회 → 없으면 `CONTENT_NOT_FOUND`(404), `status != 'published'`면 `CONTENT_WITHDRAWN`(403)
2. **`paywall.md` 4.1 판정** — `BLOCKED` / `LIMIT_REACHED`면 403으로 종료. **차감은 하지 않는다**(차감은 재생 시작 시점 — 4.2)
3. 단기 서명 URL 생성 — 만료는 수 분 단위(`architecture.md` 9.4). 값 자체는 서버 설정이며 계약은 `expires_in_sec`으로 값에 독립적이다
4. `audio_access_logs` 적재 — `user_id` · `device_id` · `issued_at` · `expires_at` · `ip_hash`. **URL 원문은 저장하지 않는다**(`domain.md` 6.5 — DB에 남기면 그것이 곧 유출 경로다). 적재는 **서버 몫**이며 클라이언트가 관여할 필드가 없다

- **재생 중 갱신도 이 처리 그대로다.** 갱신 시점에 콘텐츠가 회수됐으면 403이 나고, 클라이언트는 일시정지 후 "제공이 종료된 콘텐츠예요"(PL9)로 전환한다. **이미 발급된 URL은 만료 시각까지 유효하다** — 이것이 회수 반영 지연의 상한이다(`architecture.md` 9.4).
- **갱신은 재생이 끊기기 전에 백그라운드에서 수행한다**(`player.md` 7). 갱신 실패(5xx·네트워크)는 재생이 버퍼로 이어지는 동안 재시도하고, 소진되면 일시정지 + 재시도 안내다. 몇 초 전에 선행할지는 클라이언트 구현이 정한다(9장).
- **발급 시점의 한도 403은 경합·딥링크에서만 난다.** 정상 흐름에서는 플레이어를 연 화면이 판정·확인 팝업을 이미 통과시켰다(`player.md` 2장). 그 사이 다른 기기가 한도를 소진했거나 푸시 딥링크로 직행한 경우 여기서 걸리며, 클라이언트 동작은 재생 시작의 같은 코드와 동일하다(페이월 / 한도 안내).
- **진입 시 발급 실패(5xx·타임아웃)는 "재생할 수 없어요" + [다시 시도]다**(PL8). 이 시점에는 재생이 시작되지 않았으므로 **카운트도 차감되지 않았다**(`paywall.md` 4.3).
- **재청취 창 안의 발급은 한도 소진 상태에서도 허용된다.** `paywall.md` 4.1에서 재청취 창 검사가 한도 검사보다 먼저 `ALLOW`가 되기 때문이며, 발급이 별도 규칙을 갖지 않는다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `PLAY_LIMIT_EXCEEDED` | 403 | 최상위가 아닌 한도 티어의 소진 → **페이월 바텀시트** |
| `PLAY_LIMIT_REACHED` | 403 | 최상위 티어의 소진 → 한도 안내(페이월 아님) |
| `CONTENT_WITHDRAWN` | 403 | 파트너 회수 → "제공이 종료된 콘텐츠예요" + 라이브러리에서 제거(PL9) |
| `CONTENT_NOT_FOUND` | 404 | `content_id`가 없음 |

---

### 4.2 재생 시작 — `POST /contents/:content_id/play`

> **계약 소유: `library-api.md` 4.4.** 요청·응답·서버 처리(한도 판정 → `play_records` upsert → 상태 전이 → 드립 제외 → `play` 신호)·에러 코드는 전부 그쪽이 확정본이다. 이 절은 **플레이어가 그 계약을 언제, 어떻게 쓰는지**만 서술하며 필드를 재정의하지 않는다.

- **호출 시점은 오디오가 실제로 소리를 낸 시점이다**(`paywall.md` 4.3). 버튼 탭·발급(4.1)·버퍼링 시점이 아니다 — 로드에 실패하면 이 호출 자체가 발생하지 않고, 따라서 차감도 없다.
- **`entry_point`는 플레이어를 열게 한 진입점 그대로 보낸다**(`library` / `explore` / `miniplayer` / `push`). **예외는 완료 화면의 ▶ 재청취 하나** — 재청취 창 밖의 새 차감 재생은 플레이어가 시작시키는 것이므로 `player`를 보낸다(확정 2026-08-10 — `paywall.md` 4.2 예외 · `library-api.md` 4.4 enum).
- **재청취도 이 호출을 거친다.** 완료 상태의 ▶(위치 0 재생)든 창 안의 이어듣기든 같은 경로다. 재청취 창(15일) 안이면 서버가 차감 없이 허용하고, 그 재생의 `play_records` 행은 `is_counted = false`로 적재된다(`domain.md` 6.3 — `listened_sec` 적산을 위해 행은 필요하다). 창 밖이면 새 차감이며 판정은 전부 서버 몫이다(`paywall.md` 4.3-1).
- **응답 사용**: `progress`로 시작 위치를 확정하고, `daily_play_limit` / `daily_play_count` / `service_date`로 잔여 표시를 갱신한다(신선도 규칙은 `paywall.md` 5장).
- **완료 상태에서 ▶로 시작한 재생이면 `replay` 신호(4.4)를 함께 보낸다.**
- **04시 경계를 넘겨 듣는 중에는 추가 호출이 없다.** 이미 시작된 재생은 중단하지 않으며(`paywall.md` 7), `listened_sec`은 재생 시작 시점의 서비스 날짜 행에 계속 누적된다(4.3).
- 오프라인 큐에서는 소비 신호로 취급되어 **발생 시각 순서대로** 전송된다(`common-error-handling.md` 4.5). 같은 세션의 위치 저장보다 먼저 도착해야 `listened_sec` 적산 대상 행이 존재한다(4.3 서버 처리 5).

---

### 4.3 `PUT /users/me/playback-progresses/:content_id`

재생 위치 저장. `player.md` 4.3(위치)·4.4(완청 판정)·4.4-1(실제 청취 시간)에 대응한다.

**호출 시점은 `player.md` 4.3이 소유한다** — 5초 주기 / 일시정지 / 화면 이탈 / 앱 백그라운드 진입 / 재생 종료. 이 계약은 시점을 강제하지 않고, 언제 도착하든 같은 규칙으로 처리한다.

**Request**

```json
{
  "position_sec": 552,
  "max_reached_sec": 552,
  "listened_sec_delta": 5,
  "content_version": 1
}
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| position_sec | int (≥ 0) | 필수 | 현재 재생 위치 |
| max_reached_sec | int (≥ 0) | 필수 | 클라이언트가 추적한 **연속 도달 최대 위치.** 시크로 점프한 위치는 포함하지 않는다(`player.md` 4.4) |
| listened_sec_delta | int (≥ 0) | 필수 | **직전 반영 성공 이후** 재생기가 실제로 소리를 낸 경과 시간(초). 배속과 무관한 실시간이며 시크로 건너뛴 구간은 제외한다(`player.md` 4.4-1). 0 허용 |
| content_version | int | 필수 | 발급(4.1) 응답에서 받은 값. 재발행 감지용 |

- **`listened_sec_delta`가 절대값이 아니라 증분인 이유** — `play_records.listened_sec`은 하루·콘텐츠당 1행에 **누적**되는 값이고(`domain.md` 6.3), 같은 행에 여러 기기가 적산할 수 있어 클라이언트는 서버의 현재 합을 알 수 없다. 절대값으로 보내면 다른 기기의 적산분을 덮어쓴다.
- **오프라인 큐에서는 같은 콘텐츠의 최신 1건만 유지한다**(`common-error-handling.md` 4.5). 이때 **위치·도달값은 최신값으로 덮어쓰되, `listened_sec_delta`는 미반영 누적분을 합산해 담는다.** delta의 정의가 "직전 반영 성공 이후"이므로, 반영에 성공하기 전까지의 조작은 전부 한 delta에 쌓인다 — 덮어쓰기가 청취 시간을 유실시키지 않는다. 반영에 성공하면 클라이언트는 누적분을 0으로 되돌린다.

**Response 200**

```json
{
  "position_sec": 552,
  "max_reached_sec": 552,
  "content_version": 1,
  "library_item": { "id": "uuid", "status": "in_progress", "completed_at": null }
}
```

| 필드 | 의미 |
|---|---|
| `position_sec` · `max_reached_sec` | 저장 후의 값. 버전 불일치로 저장이 버려졌으면 **서버가 보관 중인 값** |
| `content_version` | 서버의 현재 버전. **요청과 다르면 클라이언트는 로컬 위치·오프라인 파일을 폐기한다**(`player.md` 7) |
| `library_item` | 이 저장으로 완청이 판정되면 `status: "completed"` + `completed_at`. 라이브러리에 없는 콘텐츠면 `null` |

**서버 처리**

1. 콘텐츠 조회 → 없으면 `CONTENT_NOT_FOUND`(404). **회수 여부는 검증하지 않는다** — 회수의 차단 지점은 발급(4.1)이고, 이미 발급된 URL로 진행 중인 재생의 위치까지 거부하면 유효한 청취 기록이 유실된다(`architecture.md` 9.4의 지연 상한 안에서 일어나는 정상 재생이다)
2. **`content_version`이 현재와 다르면 저장하지 않고** 현재 상태를 200으로 반환한다. 재발행 전 버전에서 계산된 위치가 새 오디오에 씌워지는 것을 막는다 — 특히 길이가 짧아진 재발행에서 낡은 `max_reached_sec`이 90%를 넘겨 **가짜 완청**을 만드는 것을 막는 안전장치다
3. 값 보정 — `position_sec` · `max_reached_sec`이 `duration_sec`을 초과하면 `duration_sec`으로 보정해 저장한다(경계·배속 타이밍 오차는 정상이다). 음수·필드 누락은 `VALIDATION_FAILED`(400)
4. `playback_progresses` upsert — user × content 당 1행(`domain.md` 6.2). 여러 기기 충돌은 **행 단위 last-write-wins**이며 서버가 `max_reached_sec`을 단조 증가로 보정하지 않는다(`domain.md` 6.2 — 충돌 규칙은 스키마 소유자가 정했다)
5. `listened_sec` 적산 — 그 (user, content)의 **가장 최근 `play_records` 행**에 `listened_sec_delta`를 더한다. 재생 시작(4.2)마다 그 서비스 날짜의 행이 upsert되므로, 최근 행이 곧 **재생 시작 시점의 서비스 날짜** 행이다(`player.md` 4.4-1 — 04시 경계를 넘겨도 시작일 행에 누적). 행이 없으면(비정상 순서) 위치만 저장하고 delta는 반영하지 않는다
6. **완청 판정** — 보정 후 `max_reached_sec`이 `duration_sec`의 90% 이상에 **처음** 도달했고 `library_items` 행이 `completed`가 아니면, 같은 트랜잭션에서 `status = 'completed'` + `completed_at` 기록 + `user_signals(action = 'complete')` 적재(`player.md` 4.4). 기준값 90%는 `player.md` · `library.md`가 소유하며 여기서 바꾸지 않는다

- **이미 `completed`면 전이도 신호 적재도 반복하지 않는다.** `completed_at`은 최초 값을 유지하고(`library.md` 7), 완료 후 되감아 들어도 상태는 내려가지 않는다. `replay` 후의 위치 저장도 같은 규칙이다 — `position_sec`은 갱신되지만 `status`는 `completed` 그대로다.
- **판정은 재생 종료를 기다리지 않는다.** 서버는 **매 저장마다** 판정하므로 90% 도달 후 늦어도 다음 저장(주기 5초) 안에 `completed`가 응답에 실린다(확정 2026-08-10 — "도달 순간 즉시 판정"의 HTTP 표현). 클라이언트는 이 응답으로만 완료 UI(PL3)로 전환한다 — **클라이언트는 판정하지 않는다.**
- **`duration_sec`이 없거나 0이면 이 경로로는 판정할 수 없다.** 그 콘텐츠의 완청은 재생 종료 이벤트에서 클라이언트가 `library-api.md` 4.5(완청 처리)를 호출하는 폴백을 따른다(`library.md` 7).
- **라이브러리에 없는 콘텐츠는 진행만 저장한다.** 상태 전이·`complete` 신호는 라이브러리 행이 전제다. 실제로는 탐색 재생의 자동 적립(`explore-api.md` 4.6)이 행을 만들어 두므로 이 분기는 경합에서만 나타난다.
- **백그라운드 동기화 실패는 사용자에게 알리지 않는다**(`common-error-handling.md` 4.3). 큐에 적재해 다음 기회에 재전송하며, 앱 강제 종료 시 마지막 저장 이후 최대 5초 손실은 허용된 값이다(`player.md` 7).

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | 음수 값·필드 누락 |
| `CONTENT_NOT_FOUND` | 404 | `content_id`가 없음 |

---

### 4.4 `POST /contents/:content_id/replay`

`replay` 신호 적재. 완료 상태(`library_items.status = 'completed'`)에서 ▶를 탭해 **위치 0부터의 재생이 실제로 시작된 시점**에 보낸다(`player.md` 5장 — PL3).

**Request** — 본문 없음. `Idempotency-Key` 헤더 **필수**(3장 설계 메모 — 큐 재전송의 중복 적재 흡수, `domain.md` 1.4).

**Response 204** — 본문 없음.

- **재생 시작(4.2)과 함께 보낸다.** 재청취도 재생 시작 계약을 거치므로 두 요청이 같은 시점에 나간다. `replay`는 신호 적재일 뿐 재생 허용·차감과 무관하다 — 허용 판정은 4.2가 이미 담당했다.
- **[10초 뒤로]로 끝부분을 되짚는 것은 `replay`가 아니다.** 위치 0부터의 재생만 재청취다(`player.md` 5장). 이 구분은 위치를 아는 클라이언트만 할 수 있으므로 서버 추론이 아니라 클라이언트 전송으로 둔다 — 클라이언트가 보내는 유일한 신호인 이유다(3장 설계 메모).
- **서버는 `library_items.status = 'completed'`를 확인하고, 아니면 적재하지 않고 그대로 204를 반환한다.** 완료가 아닌 상태의 `replay`는 정의에 없는 신호이고(스코어링 왜곡 방지 — `domain.md` 6.4는 스코어링 입력 전용), 백그라운드 신호라 오류를 노출할 이유도 없다(`common-error-handling.md` 4.3 — 사용자가 시작하지 않은 실패는 알리지 않는다).
- `user_signals(action = 'replay')` 적재가 처리의 전부다. `content_stats.replay_count`는 이 신호의 구간 재집계로 채워진다(`domain.md` 5.4) — 이 요청이 카운터를 직접 올리지 않는다.
- 오프라인 큐에서는 소비 신호로 **전부 보존, 발생 시각 순서대로 전송**된다(`common-error-handling.md` 4.5).

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `CONTENT_NOT_FOUND` | 404 | `content_id`가 없음 |

---

### 4.5 `POST /contents/:content_id/source-link-clicks`

원문 유입 클릭 적재. **라이브러리(L4)·탐색(E12)·플레이어(화면 상시 + PL7 더보기) 세 화면이 공용으로 쓰는 계약이다**(더보기 통일 확정 2026-08-10 — `changes/archive/more-sheet-source-link-unified(fe).md`). [원문 보기] 탭 = 이 호출 + 인앱 브라우저 열기.

**Request** — 본문 없음.

**Response 204** — 본문 없음.

- **클릭 1회 = 1행이다**(`domain.md` 6.6). 클릭 시각은 별도 필드 없이 행의 `created_at`이다. 같은 사용자가 여러 번 탭하면 그 수만큼 행이 생긴다 — 중복이 아니라 각 클릭이 사건이다.
- **어느 화면에서 탭했는지는 받지 않는다.** `source_link_clicks`에 화면 구분 컬럼이 없고(`domain.md` 6.6 — 스키마에 없는 컬럼을 계약이 만들지 않는다), 이 값의 용도는 콘텐츠 단위 정산 지표(`content_stats.source_link_click_count`) 하나다. 화면별 분석이 필요해지면 구조화 로그가 아니라 스키마 개정부터다.
- **인앱 브라우저 열기는 이 요청의 성공을 기다리지 않는다.** 기록 실패가 원문 보기를 막으면 파트너 유입(PRD 8.3)이 우리 장애에 볼모가 된다. 실패는 사용자에게 알리지 않는다(`common-error-handling.md` 4.3).
- **실패분은 오프라인 큐에 적재해 재전송한다**(편입 확정 2026-08-10 — `common-error-handling.md` 4.5, 전부 보존·순서대로 전송). 정산 지표 원천이라 유실을 감수하지 않는다. 이에 따라 **`Idempotency-Key` 필수다** — 재전송 중복이 `content_stats.source_link_click_count`를 부풀리는 문제는 replay(4.4)와 같다.
- **회수 여부는 검증하지 않는다.** 회수 직후 아직 화면에 남아 있던 버튼이 탭될 수 있고, 회수 전 소비분의 통계가 유지되는 것과 같은 논리로(`domain.md` 5.4) 클릭 사실의 적재를 막을 이유가 없다.
- **오프라인 큐 적재 대상이 아니다.** `common-error-handling.md` 4.5의 큐 대상 표에 이 요청이 없다 — 실패분은 유실을 감수한다. 정산 지표의 원천이라는 성격과 충돌할 수 있어 9장 미결로 남긴다(큐 대상 표는 features 소유라 이 문서가 늘리지 않는다).
- **204인 이유** — 만들어진 행은 클라이언트가 다시 조회·참조할 수 없는 적재 전용 기록이라 201 + 본문·Location이 성립하지 않는다. `replay`(4.4)도 같다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `CONTENT_NOT_FOUND` | 404 | `content_id`가 없음 |

---

## 5. 에러 코드 표

**이 표는 `common-error-handling.md` 9장 중앙 표의 발췌다**(재생 계열 9.5 + 공용 콘텐츠 9.2 + 기반 9.1) — 두 곳이 어긋나면 9장이 기준이다. **플레이어 고유의 신규 코드는 없다** — 이 화면의 모든 분기가 기존 코드로 표현된다(9장에 새로 등재할 것이 없다).

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `PLAY_LIMIT_EXCEEDED` | 403 | false | **페이월 바텀시트**(`paywall.md` 4.5). 발급(4.1) 시점이면 플레이어를 닫고 전환 |
| `PLAY_LIMIT_REACHED` | 403 | false | "오늘 청취 한도를 모두 사용했어요" 안내. 페이월 아님 |
| `CONTENT_WITHDRAWN` | 403 | false | "제공이 종료된 콘텐츠예요" + [닫기](PL9). 라이브러리에서도 제거, 미니플레이어면 내림 |
| `CONTENT_NOT_FOUND` | 404 | false | 목록에서 제거. 재생 중이면 로드 실패 처리(PL8) |
| `VALIDATION_FAILED` | 400 | false | 백그라운드 요청이므로 사용자 비노출 + 로그 수집 |

- 401(토큰 갱신)·429·5xx는 `common-error-handling.md` 4.1~4.2의 공통 규칙을 따른다. 위치 저장·신호의 실패는 어떤 코드든 **사용자에게 노출하지 않는다**(4.3 — 백그라운드 동기화).
- 발급(4.1)의 5xx·타임아웃만 화면에 드러난다 — "재생할 수 없어요" + [다시 시도](PL8, 차단형 진입 조회).

## 6. 흐름

**진입 → 재생 → 완청**

```
목록·미니플레이어·푸시 탭
   ↓ (여는 화면) 한도 판정·확인 팝업 — paywall 4.1~4.2 · library-api 4.4 흐름
플레이어 진입
POST /contents/:content_id/audio-urls          ← 메타 + 서명 URL (왕복 1회)
   ├─ 403 PLAY_LIMIT_* → 페이월 / 한도 안내 (경합·딥링크)
   ├─ 403 CONTENT_WITHDRAWN → PL9 + 라이브러리 제거
   └─ 201 → 오디오 준비 → 재생 실제 시작
        ├─ POST /contents/:content_id/play     ← library-api 4.4 (카운트·상태 전이)
        └─ (완료 상태에서 ▶였다면) POST /contents/:content_id/replay
재생 중 (5초 주기 · 일시정지 · 이탈 · 백그라운드 · 종료)
PUT /users/me/playback-progresses/:content_id
   └─ 응답 library_item.status = "completed" → 완료 UI(PL3)   ← 판정은 서버만
```

**재생 중 URL 갱신**

```
audio.expires_in_sec 기반 백그라운드 스케줄
POST /contents/:content_id/audio-urls (재호출)
   ├─ 201 → 재생기 소스 교체 (재생 무중단)
   ├─ 403 CONTENT_WITHDRAWN → 일시정지 + PL9
   └─ 실패 지속 → 버퍼 소진 시 일시정지 + 재시도 안내 (player 7)
```

**원문 보기 — 세 화면 공통**

```
[원문 보기] 탭 (플레이어 상시 / L4·E12·PL7 더보기)
   ├─ POST /contents/:content_id/source-link-clicks   (응답을 기다리지 않는다)
   └─ 인앱 브라우저로 source_url 열기
```

**오프라인 큐 복귀** (`common-error-handling.md` 4.5)

```
온라인 복귀
   → 소비 신호(play·replay)를 발생 시각 순서대로 전송   ← play가 위치 저장보다 선행
   → 위치 저장은 콘텐츠당 최신 1건 (listened_sec_delta는 미반영 누적 합산)
```

## 7. 보안·검증 규칙

`architecture.md` 9장, 특히 **9.4(콘텐츠 보호 — 협상 대상이 아니다)** 를 이 도메인에 적용한 결과다.

- **오디오는 공개 URL로 노출하지 않는다.** 발급은 매번 단기 서명 URL이고, 원본 경로(`audio_path`)는 어떤 응답에도 실리지 않는다.
- **발급 시점에 접근 권한을 재검증한다** — 구독·재생 한도·회수. 목록에서 걸렀어도 발급이 다시 확인한다.
- **서명 URL을 어디에도 저장하지 않는다.** 서버는 `audio_access_logs`에 발급 사실만 남기고(`domain.md` 6.5), 클라이언트도 재생기에 전달하는 용도 외로 보관·로깅하지 않는다. 발급 응답에는 `Cache-Control: no-store`를 적용한다.
- **발급 이력이 이상 탐지의 근거다.** 짧은 시간의 다수 발급(대량 다운로드 패턴)은 사용자 단위 레이트 리밋 + 관측 대상이며(`architecture.md` 9.6), 초과는 429 + `retry_after_sec`이다.
- **미디어 캐시는 앱 전용 저장소에 두고 외부 접근을 차단한다**(`player.md` 4.8 — 클라이언트 구현 규칙).
- **모든 조회·변경은 토큰의 `user_id`로 스코프한다.** 경로에 `userId`를 받지 않고 `me`를 쓴다(IDOR — `architecture.md` 9.2).
- **완청·청취 시간의 판정·적산은 서버가 한다.** 클라이언트가 보낸 `max_reached_sec` · `listened_sec_delta`는 자기 계정의 진행 기록 입력일 뿐, 한도·결제 판정에 쓰이지 않는다. 값의 범위(0 이상·`duration_sec` 이하 보정)는 서버가 검증한다. `listened_sec_delta`는 정산 원천이므로 비정상 크기에 대한 상한 검증이 필요하다 — 값은 미결(9장).
- **재생 한도·재청취 창 판정은 서버에서만 한다**(`paywall.md` 4.1 · 4.3-1). 발급·재생 시작 어느 쪽도 클라이언트 힌트를 판정에 쓰지 않는다.
- 전역 `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`) — DTO에 없는 필드는 잘라낸다.

## 8. 데이터 모델

> 스키마는 [`domain.md`](../../backend/domain.md)가 유일한 기준이다. 이 문서에 컬럼을 중복 기재하지 않는다.

| 사용하는 것 | domain.md |
|---|---|
| `playback_progresses` — 위치·최대 도달의 단독 소유자. user × content 1행, 충돌은 LWW | 6.2 |
| `play_records` — `listened_sec` 적산 대상 + `is_counted`(재청취 창 차감 구분) | 6.3 |
| `user_signals` — 플레이어 관련 값은 `play`(4.2) · `complete`(서버, 4.3) · `replay`(4.4). **`skip`은 없다** | 6.4 |
| `audio_access_logs` — 발급 사실만 기록. **URL 원문 저장 금지** | 6.5 |
| `source_link_clicks` — 원문 유입 클릭. `content_stats.source_link_click_count`의 유일한 원천 | 6.6 |
| `contents` — `audio_path`(비노출) · `duration_sec` · `content_version` · `status` · 출처 고지 필드 | 5.1 |
| `library_items` — 완청 전이(`status` · `completed_at`)의 대상 | 6.1 |
| `content_scripts` — **P1.** 스크립트 계약 추가 시 사용 | 5.3 |
| `user_settings` — 배속(`settings-api.md` 4.2 소관) · `sleep_timer_last_choice`(P1, 플레이어 소관) | 3.5 |
| `idempotency_keys` — `replay`의 중복 흡수 | 1.4 |

- **`PlaybackSession`은 폐기된 개체다**(`domain.md` 14장). 위치·도달은 `playback_progresses` 하나가 갖고, 청취 시간은 `play_records` 행에 적산한다 — 세션 테이블을 되살리는 필드를 계약에 만들지 않는다.
- **`seek` · `rate_change`는 어떤 요청으로도 전송하지 않는다.** 신호 테이블에 넣지 않기로 확정된 값이다(`domain.md` 6.4 — 필요하면 구조화 로그).
- `playback_progresses` · `play_records` · `user_signals` · `audio_access_logs` · `source_link_clicks`는 전부 `playback` 모듈 소유다(`domain.md` 2장). 완청 전이는 `library` 모듈의 Service를 호출해 수행한다.

## 9. 미결 사항

- ~~`listened_sec_delta`의 이중 적산 방어~~ → **해소(협의 2026-08-10): ① 위험 감수 + 적산량 이상치 관측으로 확정.** 계약 변경 없음 — 위치·도달은 절대값이라 무해하고, delta 중복은 드문 경우(응답 유실 직후 재전송)라 멱등키 적재량·스키마 개정 비용이 이득을 넘는다. 운영에서 이상치가 관측되면 ②(멱등키)·③(순번 컬럼)을 재검토한다.
- ~~`listened_sec_delta` 상한 검증값~~ → **해소(협의 2026-08-10): 서버 구현 재량으로 확정.** 계약은 값에 독립적이라 변경 없음 — 상한 초과분의 처리(클램프)도 서버 몫이다.
- ~~90% 도달 시점의 즉시 전송~~ → **해소(2026-08-10): 현행 유지.** 주기 저장에 실려 도달 후 최대 5초 안에 판정이 도착하는 것을 수용한다 — 판정 주체(서버)와 결과는 동일하고, 이탈·일시정지 시에는 어차피 즉시 저장이 나간다. `player.md` 4.3 저장 시점 목록은 바꾸지 않는다.
- ~~원문 클릭의 오프라인 큐 편입 여부~~ → **해소(2026-08-10): 큐에 편입한다.** `common-error-handling.md` 4.5 표에 등재됨(전부 보존·순서대로 전송). 이에 따라 이 엔드포인트는 `Idempotency-Key` 필수가 됐다(4.5 — 재전송 중복이 정산 지표를 부풀리는 문제는 replay와 같다).
- **서명 URL 만료값과 갱신 선행 임계** — 만료는 "수 분 단위"(`architecture.md` 9.4)로만 확정이며 구체 값은 서버 설정이다. 계약은 `expires_in_sec`으로 값에 독립적이므로 확정돼도 계약 변경은 없다. 클라이언트의 갱신 선행 시점(만료 몇 초 전)은 구현 규칙으로 정한다.
- **P1 추가분** — 스크립트 조회(오디오와 동일한 접근 통제 + 발급 응답의 스크립트 존재 플래그 — 버튼 노출 판단용)와 수면 타이머 마지막 선택 저장(`sleep_timer_last_choice` 값 집합 확정 후)은 P1 구현 시 이 문서에 엔드포인트를 추가한다.
