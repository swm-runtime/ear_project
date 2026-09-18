# 공개 API 명세서

> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 4.1(`topics`)
> 노출 규칙: [`docs/features/admin.md`](../../features/admin.md) 4.5 · [`docs/features/onboarding.md`](../../features/onboarding.md) 3

## 1. 범위

**로그인 없이 부르는** 엔드포인트를 모은다(신설 2026-09-17). 앱 화면이 아니라 **랜딩 페이지(`landing-page/`)** 가 쓴다.

- **랜딩은 개발계 API(`api-dev.earcast.co.kr`)를 본다**(결정 2026-09-18). 랜딩은 검증이 중요한 화면이 아니라 `dev` 머지만으로 배포·확인하므로, 여기 엔드포인트는 `dev`에 머지되면 곧바로 랜딩에서 쓰인다. 필요한 env(`PUBLIC_SAMPLE_CONTENT_ID`·`CORS_ORIGINS`의 랜딩 오리진)도 **개발계 서버**에 둔다.

- 응답에는 **누구에게 보여도 되는 값만** 싣는다 — id·정렬값·노출 여부 같은 운영 값은 싣지 않는다.
- 인증이 없으므로 전역 레이트 리밋(IP 단위)만 걸린다.
- 앱 사용자용 목록(`onboarding-api.md` 4.2 등)을 대신하지 않는다. 같은 판정을 쓰는 읽기 전용 사본이다.

## 2. 엔드포인트

| # | 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|---|
| 1 | GET | `/public/topics` | 공개된 주제 — 대분류별로 묶은 이름 목록 | 없음 |
| 2 | GET | `/public/sample` | 랜딩 Try 섹션의 샘플 한 편 — 표시 정보 + 짧은 만료의 서명 오디오 URL(신설 2026-09-18) | 없음 |

### 2.1 `GET /public/topics`

랜딩 페이지의 "고를 수 있는 주제" 섹션이 **빌드할 때** 받아 HTML에 굽는다. 랜딩은 하루 한 번 자동으로 다시 빌드되어, 관리자에서 주제를 공개·숨김하면 늦어도 다음 날 랜딩에 반영된다.

**Response 200** · `Cache-Control: public, max-age=300`

```json
{
  "groups": [
    { "name": "돈", "topics": [{ "name": "재테크" }, { "name": "부동산" }] },
    { "name": "일", "topics": [{ "name": "커리어 설계" }] }
  ]
}
```

- **노출 판정은 온보딩과 같다** — `topics.is_visible = true`만. 노출 가능 콘텐츠가 0건인 주제는 서버가 켜지 못하게 하고 자동으로 숨기므로(`admin.md` 4.5), 여기 나오는 주제는 들을 콘텐츠가 있다.
- 정렬 — 주제는 `display_order` 오름차순, **대분류는 그 대분류의 첫 주제가 나온 순서**다. 대분류에는 정렬 컬럼이 없고, 관리자 콘솔이 체계 순서대로 `display_order`를 매긴다(`changes/archive/topic-taxonomy-v2.md`).
- 공개 주제가 0개면 `{ "groups": [] }` — 404가 아니다. 랜딩은 이때 내장 기본 목록을 그린다.

### 2.2 `GET /public/sample`

랜딩 페이지 Try 섹션("먼저 들어보고 결정하세요")이 **브라우저에서 재생 시점에** 부른다. 서명 URL은 수 분 만에 만료되므로 빌드 시점에 HTML에 굽지 못한다 — 2.1과 호출 시점이 다르다.

**Response 200** · `Cache-Control: no-store`

```json
{
  "content": {
    "title": "말이 막혀도 생각은 돌아간다",
    "author_name": "윤태경",
    "source_name": "이어 오리지널",
    "duration_sec": 780,
    "thumbnail_url": "https://cdn.example/thumb/....webp"
  },
  "audio": {
    "url": "https://cdn.example/audio/....mp3?Policy=...&Signature=...&Key-Pair-Id=...",
    "expires_at": "2026-09-18T00:05:00.000Z",
    "expires_in_sec": 300
  }
}
```

- **파일을 랜딩에 내려받아 두지 않는다.** 앱 재생(`player-api.md` 4.1)과 **같은 서명기**(CloudFront 서명 URL, local 모드는 HMAC 스트리밍 URL)로 발급한다. 원본 경로가 공개 HTML에 박히지 않고, 만료가 지나면 링크가 죽는다(`architecture.md` 9.4). 랜딩은 `expires_in_sec`이 지났으면 재생 전에 다시 부른다.
- **대상은 요청이 아니라 서버 설정이 정한다** — `PUBLIC_SAMPLE_CONTENT_ID`(env). 로그인 없는 경로에서 콘텐츠 id를 받으면 전 카탈로그의 서명 URL 발급기가 되므로 받지 않는다.
- 노출 판정은 앱과 같다(발행 상태 + 라이선스 유효). 지정한 콘텐츠가 회수·만료됐거나 env가 비어 있으면 아래 에러다.
- 사용자가 없으므로 재생 한도 판정·차감·`audio_access_logs` 적재가 없다. 발급 사실은 서버 구조화 로그에만 남는다.
- 응답에 콘텐츠 id·버전·원문 링크·저장소 키는 싣지 않는다(2.1과 같은 원칙).

## 3. 에러

2.1은 고유 에러 코드가 없다. 429(레이트 리밋)·5xx는 `common-error-handling.md` 4장을 따른다 — 랜딩 빌드는 실패하면 기본 목록으로 대체하고 빌드를 멈추지 않는다.

2.2는 다음을 낼 수 있다. 랜딩은 어느 쪽이든 플레이어를 "준비 중" 상태로 그리고 조작을 잠근다.

| error_code | HTTP | 상황 |
|---|---|---|
| `NOT_FOUND` | 404 | `PUBLIC_SAMPLE_CONTENT_ID`가 비어 있음 |
| `CONTENT_NOT_FOUND` | 404 | 지정한 콘텐츠가 없음 |
| `CONTENT_WITHDRAWN` | 403 | 지정한 콘텐츠가 회수·라이선스 만료됨 |
