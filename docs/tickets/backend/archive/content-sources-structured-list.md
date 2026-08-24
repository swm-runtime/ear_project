# [BE] 콘텐츠 상세 — ai_generated 소스 목록의 구조화 제공

| 항목 | 값 |
|---|---|
| 대상 | `contents` 스키마(`domain.md` 5.1) · 콘텐츠 단건 상세 조회 계약(신설 예정) · 관리자 업로드 입력(`admin.md` 3.1) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-08-23 |
| 반영 날짜 | 2026-08-24 |
| 발견 시점 | 콘텐츠 상세 화면(FR-40) 명세·시안 작성 중 — `features/content-detail.md` 4.3 확정 과정 |
| 근거 문서 | `features/content-detail.md` 4.3·미결 · `wireframe/content-detail.html` CD2·검증 V3 · `backend/domain.md` 5.1 |
| 심각도 | **중** — 콘텐츠 상세 화면의 `ai_generated` 출처 영역이 이 계약 없이는 실서버로 동작하지 않는다. FE는 mock으로 선행 개발한다 |

## 증상

콘텐츠 상세 화면(FR-40, 합의 2026-08-23)의 출처 영역이 origin에 따라 갈린다.

- `partner`(원문): 저자 · 제공 · [원문 보기] — **기존 컬럼(`author_name` · `source_name` · `source_url`)으로 충족된다. 이 티켓의 대상이 아니다**
- `ai_generated`(소스): **참고한 소스 목록을 전부 나열한다 — 소스마다 제목·저자를 표시하고, 항목 탭이 링크를 연다. "외 N건" 생략 금지, URL 문자열 비노출**(확정 2026-08-23)

그런데 현재 스키마에는 **소스 단위(제목–링크 쌍) 구조가 없다.**

| 컬럼 | ai_generated에서의 현재 용도 | 왜 안 되나 |
|---|---|---|
| `source_name` | "참고한 자료" **표기 문자열 하나** (예: `"『딥 워크』(칼 뉴포트) 외 2건"`) | 자유 텍스트라 소스별로 쪼개 돌려줄 수 없다 |
| `source_url` | 링크 **1개**, 선택 | 소스가 여러 건이면 어느 소스의 링크인지 정의가 없다 |

## 원인

`domain.md` 5.1의 의도된 결정이다 — "복수 소스를 별도 테이블·배열로 정규화하지 않는다. **이 값의 용도는 출처 고지 문구 표시(FR-12) 하나뿐**이고, 소스 단위 질의·조인·집계 요구가 없다. **소스 단위 관리 요구가 생기면 그때 테이블로 승격한다**."

콘텐츠 상세 화면이 소스 단위 표시(제목+URL)를 요구하면서 그 전제가 깨졌다 — domain.md가 예고해 둔 "그때"가 온 것이다.

## 고쳐야 할 것

### 1. 소스 목록을 구조화해 내려준다

콘텐츠 단건 상세 조회 응답(FR-40용 신설 예정)에 `ai_generated` 콘텐츠의 소스 목록을 싣는다.

```json
{
  "sources": [
    { "title": "딥 워크", "author": "칼 뉴포트", "url": null },
    { "title": "몰입을 부르는 환경 설계", "author": null, "url": "https://blog.example.com/deep-focus" }
  ]
}
```

- 소스마다 `title`(필수) + `author`(선택) + `url`(선택 — 링크 없는 소스는 `null`)
- 화면은 제목·저자만 표시하고 URL 문자열은 노출하지 않는다 — **링크가 있는 소스는 항목 탭이 인앱 브라우저를 연다**(FE 규칙, `content-detail.md` 4.3). 저자를 제목에 뭉치지 않고 별도 필드로 받는 이유다
- **순서는 서버가 정해 내려주고 클라이언트는 재배열하지 않는다**(기존 원칙과 동일)
- **저장 방식(별도 테이블 승격 vs JSON 컬럼)은 백엔드가 정한다** — domain.md 5.1이 예고한 승격 경로가 기본 후보다. `domain.md` 개정도 백엔드가 기준을 소유한다

### 2. 기존 `source_name`은 유지한다

재생 멘트의 출처 고지 문구(FR-12 — `content-pipeline.md` 4.3)는 표기 문자열이 계속 필요하므로 `source_name`은 그대로 둔다. 이 티켓은 **표시용 목록을 추가**하는 것이지 고지 문구를 대체하는 것이 아니다.

### 3. 함께 정할 것

- **소스 링크 클릭 기록** — `source_link_clicks`는 콘텐츠 단위다. 소스별 링크가 생기면 어느 소스를 눌렀는지 구분해 기록할지(컬럼 추가), 콘텐츠 단위로 뭉뚱그릴지 결정 필요. **소스 단위 기록으로 결정되면 `sources` 항목에 식별자(`id`)가 추가되고 클릭 기록 계약이 새로 생긴다** — 아래 계약 확인 절차의 대표 사례다
- **스키마 확정 후 계약 대조** — 스키마를 변경한 뒤 **`spec/api/content-detail-api.md`(현재 이 티켓의 형태를 가정 계약으로 선행 작성됨)에 변경점이 생기는지 확인하고, 있으면 api 명세에도 반영해야 한다.** 필드명·partner의 `sources` 표현(null vs 빈 배열)·소스 식별자 추가 여부가 대조 대상이다. 가정 계약을 그대로 수용하면 문서의 "가정" 표기만 확정으로 바꾼다
- **관리자 업로드 입력**(`admin.md` 3.1) — 소스를 구조화해 받도록 업로드 폼·검증의 파급 확인. 기존 발행 콘텐츠의 소스 목록 백필 여부도 함께
- `partner` 콘텐츠의 응답에서 `sources`는 빈 배열 또는 미포함(계약 작성 시 확정)

## FE 대응 (참고)

FE는 이 계약을 가정한 mock(`[{title, author|null, url|null}]`)으로 콘텐츠 상세 화면을 선행 개발한다. 계약이 확정되면 필드명·형태를 맞춘다 — spec/api(콘텐츠 단건 상세 조회) 작성 시 함께 확정하는 것이 이상적이다.

## 완료 조건

- Given `ai_generated` 콘텐츠에 소스 3건(링크 2·링크 없음 1, 저자 유무 혼재)이 등록되어 있다 / When 단건 상세를 조회한다 / Then `sources`에 3건 전부가 `{title, author|null, url|null}` 형태로 순서대로 내려온다
- Given 재생을 시작한다 / When 출처 고지 멘트를 확인한다 / Then 기존 `source_name` 기반 고지가 그대로 동작한다
- Given `partner` 콘텐츠의 단건 상세를 조회한다 / When 응답을 본다 / Then `author_name`·`source_name`·`source_url`은 기존과 동일하고, 소스 목록 규칙의 영향을 받지 않는다
- Given `domain.md` 5.1을 읽는다 / When 소스 저장 구조를 확인한다 / Then 채택한 방식(테이블 승격 또는 컬럼)과 "정규화하지 않는다" 결정의 개정 이력이 반영되어 있다
- Given 스키마 변경이 끝났다 / When `spec/api/content-detail-api.md`의 가정 계약과 대조한다 / Then 변경점이 있으면 api 명세에 반영되어 있고, 없으면 "가정 계약" 표기가 확정으로 바뀌어 있다

---

## 처리 기록 (반영 날짜 2026-08-24 — 브랜치 `feat(be)/content-detail`)

### 결정 사항

| 결정 항목 | 확정 내용 |
|---|---|
| 저장 방식 | **`content_sources` 테이블 승격** — `domain.md` 5.1이 예고한 승격 경로 그대로. `(id, content_id FK CASCADE, position, title, author NULL, url NULL)` + 유니크 `(content_id, position)`. `domain.md` 5.5 신설 |
| 소스 링크 클릭 기록 | **MVP 미기록** — `source_link_clicks`의 존재 이유(파트너 정산·리포팅)가 `ai_generated` 소스에는 없다. 따라서 `sources` 항목에 식별자(`id`)를 싣지 않는다. 소스별 분석 요구가 생기면 P1에서 `source_link_clicks.source_id` 추가와 함께 재검토 (`domain.md` 5.5·6.6) |
| `partner`의 `sources` 표현 | **`null`** — api 문서의 제안(조건부 블록 null 생략 원칙 정합)을 그대로 채택. `partner`는 `content_sources`에 행을 만들지 않는다 |
| 계약 대조 | 가정 계약 `[{title, author\|null, url\|null}]`이 **그대로 확정** — FE mock에서 바꿀 필드 없음. `content-detail-api.md`의 "가정" 표기를 확정으로 개정 |

### 반영 내역

- **문서**: `domain.md`(5.1 개정·5.5 신설·6.6·2장·14장 테이블 수·15.1 #8 소스 목록분 해소·15.2 기록) · `content-detail-api.md`(가정→확정, 9장 미결 3건 해소) · `content-detail.md`(4.3 경고·데이터 모델·미결 갱신)
- **코드**: `ContentSource` 엔티티 + 마이그레이션(`AddContentSources`) + `ContentSourceRepository` + `ContentService.findSourcesByContentId`(position 순) + 시드에 `ai_generated` 15편 소스 데이터(기존 DB 백필 포함 — 재실행 한 번으로 채워진다)
- **관리자 업로드 파급**(함께 정할 것 3): 업로드 코드가 아직 없어 코드 파급은 없음. `admin.md` 3.1·4.2의 입력·검증 명세는 `changes/archive/admin-upload-structured-sources(be).md`로 발행·반영 완료(2026-08-24)
- **완료 조건 1(단건 상세 응답)**: `GET /contents/:content_id`가 이 브랜치의 후속 작업이라, 소스 목록의 응답 탑재는 그 구현에서 최종 확인한다. 조회 Service(`findSourcesByContentId`)까지는 이 처리에 포함됨
