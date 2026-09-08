# admin-api.md — 업로드·재발행의 `enrichment_file` 파트 계약 추가 요청

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/admin-api.md` 1장(미구현 표) · 4.6(업로드) · 4.10(재발행) |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | `tickets/backend/pending/metadata-pipeline-after-script-quality.md` 개발 범위 2(서버 저장 반영) 착수 검토 — 동작 규칙(`admin.md` 3.1)과 산출물 형식(`ai/metadata-pipeline.md` 4.4)은 확정돼 있는데 **HTTP 계약만 없다.** 계약 없는 필드는 만들지 않는 규칙이라 구현을 보류했다 |
| 요청 파트 | 백엔드 |

## 배경

1장 미구현 표가 이렇게 적고 있다:

> 추천 메타 파일(`enrichment_file` — `admin.md` 3.1) | 업로드 폼에 파트가 없다. `ai/metadata-pipeline.md` 확정 대기

"확정 대기"의 근거였던 미결 두 가지는 이미 풀렸다 — 임베딩 모델·차원 확정(2026-09-01,
`domain.md` 15.1 #11), 산출물 형식 확정(`ai/metadata-pipeline.md` 4.4의 `enrichment.json`).
스코어링 쪽(임베딩 축·취향 벡터·MMR)은 2026-09-07 활성화됐으므로(PR #165), **데이터 유입
경로인 이 계약이 지금의 병목이다.**

## 수정 내용 (제안 — 계약 확정은 협의 대상)

### 1. 4.6(업로드) · 4.10(재발행)에 multipart 파트 `enrichment_file`을 추가한다

- **선택** 파트, `enrichment.json`(`ai/metadata-pipeline.md` 4.4 형식) 1개.
- 저장 대상: `difficulty` · `format` · `is_evergreen` · `keywords` → `contents` 추천 메타 4종,
  `embedding.vector` → `content_embeddings` upsert(`model` · `content_version` 포함 — 재발행이면
  올라간 새 버전으로 저장한다).
- 키가 생략된 항목은 저장하지 않는다(결손 = 스코어링 중립 — `domain.md` 5.1·5.6).

### 2. 검증 실패 시의 동작을 명문화한다 (`admin.md` 3.1이 소유한 규칙의 계약 표현)

- enum·형식 불일치(`domain.md` 5.1과 글자 불일치, 벡터 차원 ≠ 1536, `model` 불일치 등)는
  **파일만 거부하고 콘텐츠 업로드·재발행은 진행한다.**
- 응답에 파일 반영 결과를 실을 필드가 필요하다(예: `enrichment_applied: boolean` +
  거부 사유). **여기가 계약 결정이 필요한 지점이다** — 부분 성공을 200 본문으로 표현하는
  방식은 다른 라우트에 전례가 없다.

### 3. 1장 미구현 표에서 해당 행을 지운다 (계약 반영 시점에)

## 사유

- 임베딩 축은 켜져 있는데 `content_embeddings`를 채울 경로가 없다. 이 계약이 적히기 전까지
  추천 고도화의 핵심 축이 계속 잠자는 상태다.
- 서버 구현(파싱·검증·저장)은 계약이 적히는 즉시 착수 가능하다 — 동작 규칙·형식·스키마가
  전부 확정돼 있어 남은 것은 HTTP 표현뿐이다.

## 완료 조건

- Given `admin-api.md` 4.6·4.10 / When 요청 파트 목록을 읽는다 / Then `enrichment_file`(선택)의 형식·저장 대상·검증 실패 동작(파일만 거부)이 적혀 있다
- Given 계약 반영 후 / When 1장 미구현 표를 본다 / Then 추천 메타 파일 행이 없다

## 진행 (2026-09-07 — 서버 구현 선반영, PR #165)

BE 담당 지시("코드는 바로 반영, 문서는 changes로")에 따라 **서버 구현을 이 제안 형상 그대로
먼저 반영했다.** 계약 문서는 구현된 실물을 그대로 옮겨 적으면 된다:

- multipart 파트 이름 **`enrichment_file`** (선택, 1개) — 4.6(업로드)·4.10(PATCH) 양쪽.
- 위 "결정이 필요한 지점"은 이렇게 확정 구현됐다: 응답에 **`enrichment_applied: boolean`**
  (파일이 있었을 때만 존재) + 거부 시 **`enrichment_rejected_reason: string`**(운영자용 사유
  문구). 파일이 없으면 두 필드 모두 없다.
- 검증: enum(`domain.md` 5.1)·형식·벡터 1536차원·모델 일치(`text-embedding-3-small`), 모르는
  최상위 키 거부(오타 방지 — 명세의 `source` 표식은 허용). 실패 시 파일만 거부하고 콘텐츠
  처리(업로드·재발행)는 진행한다.
- **계약에 함께 적을 것 하나가 늘었다** — 4.10에서 `enrichment_file` **단독** 전송을 허용하며,
  이때 `content_version`을 올리지 않고 메타만 반영한다(감사 로그 `content.enrich`). 기존
  발행분 소급 부여가 이 경로를 쓴다. 버전을 올리면 오디오가 그대로인데 전 사용자의 재생
  위치가 헛되이 폐기되기 때문이다.

## 처리 기록 (반영 날짜: 2026-09-08)

`admin-api.md`에 전부 반영했다 — 1장 미구현 표에서 행 제거, 4.6 파트 표 + "enrichment_file"
소절(저장 대상·검증·파일만 거부·응답 필드), 4.10 파트 표 + **단독 전송 = 버전 불변 예외**
(content.enrich 감사·소급 부여 경로)를 버전 증가 불릿에 명시. 구현(2026-09-07, PR #165)이
먼저였고 계약이 따라온 순서다.
