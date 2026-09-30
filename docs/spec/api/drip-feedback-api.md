# 추천 별점 API 명세서

> 기준 문서: [`docs/features/drip-feedback.md`](../../features/drip-feedback.md)
> 어드민 집계: [`docs/spec/api/admin-api.md`](admin-api.md) 4.19
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 6.1 · 6.7 · 3.5

작성: 2026-09-30 (KAN-116)

## 1. 범위

"어제 추천 어떠셨나요?" 팝업의 세 호출 — 노출 판정, 별점 저장, 이번 주 그만 보기. **판정은 전부 서버**다(어제·이번 주·대상 자격). 어드민 버전별 집계는 `admin-api.md` 4.19.

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 | `Authorization: Bearer <access_token>` — 전부 필요 |
| 필드 | snake_case · 시각 ISO 8601 UTC · 서비스 날짜는 `YYYY-MM-DD` 라벨 |
| 멱등키 | **없다.** 별점은 `(user_id, content_id)` upsert라 재전송이 같은 상태로 수렴하고, 그만 보기는 절대값 저장이다 |

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 1 | GET | `/users/me/drip-feedback/prompt` | 팝업 노출 판정 + 묻는 편성분 (4.1) |
| 2 | POST | `/users/me/drip-feedback` | 별점 저장 (4.2) |
| 3 | POST | `/users/me/drip-feedback/mute` | 이번 주 그만 보기 (4.3) |

## 4. 엔드포인트 상세

### 4.1 `GET /users/me/drip-feedback/prompt`

앱 첫 화면 진입 시 호출. `Cache-Control: no-store`.

**Response 200**

```json
{
  "show": true,
  "placed_date": "2026-09-29",
  "muted_until": null,
  "items": [
    { "content_id": "uuid", "title": "관세는 외국이 내는 세금이 아니다", "thumbnail_url": "https://…", "source": "drip", "placed_date": "2026-09-29", "library_status": "unplayed" }
  ]
}
```

| 필드 | 의미 |
|---|---|
| `show` | 팝업을 낼지. **클라이언트는 이 값만 본다** |
| `placed_date` | 어제의 서비스 날짜 라벨(팝업 제목 근거) |
| `muted_until` | 그만 보기 중이면 종료 서비스 날짜, 아니면 null. `show=false`의 사유 표시용 |
| `items[]` | 어제 정규 편성분 중 미평가분, 최대 2편. `show=false`면 빈 배열. `library_status`(`unplayed` \| `in_progress` \| `completed`)는 보조 표시용이지 판정이 아니다 |

### 4.2 `POST /users/me/drip-feedback`

```json
{ "ratings": [ { "content_id": "uuid", "stars": 5 }, { "content_id": "uuid", "stars": 2 } ] }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `ratings[]` | 1~10건 | 필수 | |
| `ratings[].content_id` | uuid | 필수 | 내 편성분(드립·탐험) |
| `ratings[].stars` | int 1~5 | 필수 | |

**Response 204.** 같은 콘텐츠의 재전송은 덮어쓴다.

**에러**

| 코드 | HTTP | 조건 |
|---|---|---|
| `DRIP_FEEDBACK_NOT_RATEABLE` | 400 | 내 편성분이 아니거나 편성 뒤 7일이 지난 콘텐츠가 하나라도 있음 — **전부 거부** |
| `VALIDATION_FAILED` | 400 | 형식 위반(별 범위·건수·uuid) |

### 4.3 `POST /users/me/drip-feedback/mute`

본문 없음. **Response 200** `{ "muted_until": "2026-10-05" }` — 다음 서비스 주 월요일. 그 라벨의 서비스 날짜부터 다시 묻는다.

## 5. 에러 코드 표

| 코드 | HTTP | 설명 |
|---|---|---|
| `DRIP_FEEDBACK_NOT_RATEABLE` | 400 | 4.2 |

## 6. 클라이언트 처리 메모

- 팝업 표시는 `show`로만 결정한다. 어제·이번 주를 기기 시각으로 계산하지 않는다(CLAUDE.md 공통 원칙).
- 별점 전송·그만 보기는 오프라인 큐 대상으로 둘 수 있다(`common-error-handling.md` 4.5) — 접수 기간 7일 안이면 늦게 도착해도 저장된다. 기간이 지나면 `DRIP_FEEDBACK_NOT_RATEABLE`이 오며 **큐에서 버린다**(재시도 대상이 아니다).
