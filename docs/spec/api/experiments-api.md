# 단기 실험 API 계약 (2026-10-29)

단기 실험 8종(2026-10-29 확정) 중 **다른 파트와 계약이 필요한 것**만 모은 HTTP 계약이다. 실험 기간 동안 이 문서가 기준이고, 통합 때 각 화면 문서(`onboarding-api.md` · `player-api.md` · `explore-api.md` · `content-detail-api.md` · `library-api.md`)와 `features/common-error-handling.md`로 옮긴다(`changes/pending/exp-contracts.md`).

| 절 | 실험 | BE 티켓 | 이 계약을 기다리는 티켓 |
|---|---|---|---|
| 4.1 | ⑧ 온보딩 완료 후 플레이어 띄우기 | KAN-292 | KAN-295 (FE) |
| 4.2 | ⑤ 시리즈 유료화 — 4편부터 프로 전용 | KAN-290 | KAN-294 (FE) |

판정은 서버가 한다 — 앱은 서버가 준 값(`first_content_id`, `is_locked`, 에러 코드)으로만 그린다. 티어명으로 분기하지 않는다(루트 `CLAUDE.md`).

---

## 4.1 `GET /onboarding/first-drip` — `first_content_id` 추가 (KAN-292 ↔ KAN-295)

온보딩이 끝나면 앱이 첫 콘텐츠를 **멈춘 플레이어**로 연다(KAN-295 결정 — 자동재생하지 않는다). 앱은 첫 드립이 무엇을 담았는지 모르므로 서버가 열 편을 정해 준다.

**Response 200** — 기존 필드(`onboarding-api.md` 4.8)에 하나를 더한다

```json
{
  "status": "completed",
  "library_item_count": 2,
  "completed_at": "2026-10-29T09:12:03Z",
  "first_content_id": "6c0f0f1e-2c2a-4a0e-9f3b-6a9d6c1c2b11"
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `first_content_id` | uuid \| null | 온보딩 직후 열 콘텐츠. **`status = completed`일 때만 값이 있다** — `pending` · `no_candidates` · `queued`면 `null` |

**어떤 편을 주나 (서버 규칙)**

- 첫 드립이 적립한 편(라이브러리 `source = drip`, 첫 드립 완료 시각에 적립된 행) 중에서 고른다.
- **길이가 짧은 편 먼저**, 같으면 콘텐츠 id 순. 근거: 길이가 5분 늘 때 완청 오즈가 0.62배(실험 지표 탭 "길이별 완청률", 2026-10-28) — 첫 편은 끝까지 들을 가능성이 높은 쪽을 연다.
- 사용자가 그 사이 지웠거나(소프트 삭제) 이미 재생한 편은 건너뛴다. 남은 편이 없으면 `null`.
- 콘텐츠가 회수·만료됐으면 건너뛴다.

**클라이언트 동작**

| 응답 | 동작 |
|---|---|
| `status = completed` · `first_content_id` 있음 | 그 콘텐츠의 플레이어를 **멈춘 상태**로 연다(알림 탭과 같은 경로 — 차감 확인은 ▶ 때) |
| `status = completed` · `first_content_id = null` | 지금처럼 탐색 탭 |
| `no_candidates` · `queued` · 대기 상한 초과 | 지금처럼 탐색 탭 |

- 이 필드는 **열 편의 제안**이지 재생 허가가 아니다. 재생 판정은 ▶ 때 `POST /contents/:id/play`가 한다(한도·잠금 포함).
- 옛 서버(필드 없음)는 `null`과 같이 다룬다.

---

## 4.2 시리즈 유료화 — 4편부터 프로 전용 (KAN-290 ↔ KAN-294)

### 4.2-1 판정 규칙 (서버)

- **잠긴 편** = 시리즈 편(`contents.series_id` 있음)이고 `episode_no > 무료 편수(3)`인 편. 모든 시리즈(글로벌 포함)가 대상이다.
- **열리는 사람** = 유효 티어(`resolveEffectiveTier` — 초대 코드 Pro 포함)가 **pro** 이거나, **가입 체험 중(trial)** 인 사용자.
- 그 밖(무료·데일리)은 잠긴다. 이미 4편 이후를 듣던 사용자도 예외 없이 잠긴다(KAN-290 결정).
- 무료 편수는 서버 설정 하나(`SERIES_FREE_EPISODES`, 기본 3)다. 시리즈별로 다르게 두지 않는다.
- 서버 스위치 `SERIES_PAYWALL_ENABLED`가 `true`일 때만 잠근다. 꺼져 있으면 모든 `is_locked = false`이고 4.2-3 에러도 나지 않는다 — **앱은 스위치를 몰라도 된다**(필드만 본다).

### 4.2-2 응답 필드 `is_locked`

앱이 재생 버튼을 그리는 **모든 콘텐츠 객체**에 붙인다. 사용자마다 값이 다르다(같은 편이라도 프로에게는 `false`).

| 필드 | 타입 | 비고 |
|---|---|---|
| `is_locked` | boolean | `true`면 이 사용자는 이 편을 재생할 수 없다. 잠금 아이콘·차단 시트를 그린다 |

붙는 곳:

| 엔드포인트 | 위치 |
|---|---|
| `GET /explore/feed` · `GET /explore/contents` · `GET /explore/popular` · `GET /explore/search` | 콘텐츠 카드마다 |
| `GET /series/:series_id` | 편 목록 항목마다 |
| `GET /contents/:content_id` | 상세 최상위 |
| `GET /contents/:content_id/related` | 항목마다 |
| `GET /users/me/library-items`(라이브러리 목록) | 항목의 콘텐츠마다 |

- 시리즈가 아닌 콘텐츠·1~3편은 늘 `false`다.
- 옛 서버(필드 없음)는 `false`로 다룬다.

### 4.2-3 재생 거절 — 새 에러 코드 `SERIES_EPISODE_LOCKED`

잠긴 편을 재생하려 하면 **같은 판정 함수**(재생 게이트)가 거절한다 — 오디오 URL·재생 시작·대본이 같은 판정이다.

| 엔드포인트 | 거절 |
|---|---|
| `POST /contents/:content_id/audio-urls` (`player-api.md` 4.1) | 403 `SERIES_EPISODE_LOCKED` |
| `POST /contents/:content_id/play` (4.2) | 403 `SERIES_EPISODE_LOCKED` |
| `POST /contents/:content_id/replay` (4.4) | 403 `SERIES_EPISODE_LOCKED` |
| `GET /contents/:content_id/script` (4.7) | 403 `SERIES_EPISODE_LOCKED` |

```json
{
  "error_code": "SERIES_EPISODE_LOCKED",
  "message": "이 편은 프로 구독에서 들을 수 있어요",
  "retryable": false
}
```

| 코드 | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `SERIES_EPISODE_LOCKED` | 403 | false | **잠금 차단 시트**(카피는 `spec/uiux` — KAN-294). 플레이어를 열었으면 닫는다. 구독 화면으로 이어 준다 |

- **재생 횟수를 차감하지 않는다.** 재생 한도 판정(`PLAY_LIMIT_*`)보다 먼저 본다 — 잠긴 편에 한도 시트가 뜨지 않는다.
- 잠금과 한도가 둘 다 해당하면 `SERIES_EPISODE_LOCKED`가 이긴다.
- `is_locked`를 보고 앱이 미리 막아도, 서버는 요청이 오면 다시 판정한다(앱 값은 표시용).

### 4.2-4 편성·알림 (앱 변경 없음, 참고)

- 드립 시리즈 연속 편은 잠긴 편을 비프로 사용자에게 넣지 않는다 — 3편을 완청해도 4편이 드립으로 오지 않는다.
- 리텐션 알림 "듣던 콘텐츠"는 잠긴 편을 고르지 않는다.

---

## 미결 · 확인 필요

| 항목 | 상태 |
|---|---|
| 4.1 "짧은 편 먼저" 선정 | 이 문서에서 정했다 — 다르게 하려면 KAN-292 처리 기록에 남기고 이 절을 고친다 |
| 4.2 차단 시트 카피·잠금 아이콘 | `spec/uiux`(FE·KAN-294) 소관 |
| 4.2 탐색 피드에서 잠긴 편을 뺄지 보여 줄지 | 보여 준다(잠금 표시) — 유료 동기가 실험 목적이다. 바꾸려면 이 절을 고친다 |
