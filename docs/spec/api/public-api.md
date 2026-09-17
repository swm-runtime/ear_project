# 공개 API 명세서

> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 4.1(`topics`)
> 노출 규칙: [`docs/features/admin.md`](../../features/admin.md) 4.5 · [`docs/features/onboarding.md`](../../features/onboarding.md) 3

## 1. 범위

**로그인 없이 부르는** 엔드포인트를 모은다(신설 2026-09-17). 앱 화면이 아니라 **랜딩 페이지(`landing-page/`)** 가 쓴다.

- 응답에는 **누구에게 보여도 되는 값만** 싣는다 — id·정렬값·노출 여부 같은 운영 값은 싣지 않는다.
- 인증이 없으므로 전역 레이트 리밋(IP 단위)만 걸린다.
- 앱 사용자용 목록(`onboarding-api.md` 4.2 등)을 대신하지 않는다. 같은 판정을 쓰는 읽기 전용 사본이다.

## 2. 엔드포인트

| # | 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|---|
| 1 | GET | `/public/topics` | 공개된 주제 — 대분류별로 묶은 이름 목록 | 없음 |

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

## 3. 에러

고유 에러 코드가 없다. 429(레이트 리밋)·5xx는 `common-error-handling.md` 4장을 따른다 — 랜딩 빌드는 실패하면 기본 목록으로 대체하고 빌드를 멈추지 않는다.
