# [BE] 콘텐츠 해시태그 — 추천 메타 형식 3(`tags`) 받기·저장·내려 주기

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/admin/enrichment-file.ts`(추천 메타 파일 검증) · `contents` 스키마 · 탐색 카드·라이브러리 항목 응답 · `domain.md` 5.1 · `admin-api.md` 4.6·4.10 · `explore-api.md`·`library-api.md` |
| 요청 파트 | 백엔드 |
| 요청자 | 박수헌(KAN-139 담당 — PM 이주호 요청) |
| 담당 | 박준현 |
| 발행 날짜 | 2026-10-08 |
| Jira | [KAN-162](https://runtime364.atlassian.net/browse/KAN-162) |
| 시작 날짜 | 2026-10-08 |
| 기한 | 2026-10-11 (Medium — 3일 안) |
| 선행 | 없음. 후행: FE `content-hashtags-display.md`(KAN-163) · AI `content-tagging.md`(KAN-139, 소급) |
| 근거 문서 | `docs/ai/metadata-pipeline.md` 1장 3항·4.2 `tags` 행·4.4 형식 3 · `.claude/skills/metadata-enrichment/reference/judgment-criteria.md` tags 절 |
| 중요도 | Medium — PM 이 화면 노출을 원한다(2026-10-08). 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |
| 상태 | 완료 (반영 날짜 2026-10-08 — PR #1304) |

## 배경

PM(이주호) 요청: 콘텐츠를 분류한 주제와 별개로, SNS 해시태그처럼 **내용에 맞는 태그 2~4개**를 뽑아 **탐색 카드와 상세 화면**에 띄운다(2026-10-08).

파이프라인(KAN-139)은 태그를 기존 추천 메타 판정과 같은 호출로 뽑아 `enrichment.json`의 `tags` 키로 낸다 — 형식 **3**. 지금 서버는 자기가 아는 최신(2)보다 높은 형식과 모르는 최상위 키를 **파일째 거부**하므로(`admin-api.md` 4.6), 서버가 먼저 받아야 한다. 그때까지 파이프라인은 스위치(`ENRICH_TAGS`)로 태그를 파일에 싣지 않는다.

## 요청 내용

1. **추천 메타 파일 형식 3을 받는다** — `CURRENT_ENRICHMENT_SCHEMA_VERSION` 3. 최상위 키에 `tags` 추가.
   - `tags`: 문자열 배열 **2~4개**, 각 항목 `^[가-힣A-Za-z0-9]{2,10}$`(띄어쓰기·'#' 없음), 대소문자 무시 중복 없음. 규칙 밖이면 다른 키와 같이 **파일만 거부**하고 업로드는 진행한다(4.6 종전 규칙).
   - 생략 = 재부여에서 기존 값 유지(부분 갱신 2026-09-26 규칙 그대로). 형식 2 파일은 종전대로 받는다.
2. **저장** — `contents`에 태그 저장처(예: `tags jsonb NULL`)를 둔다. `domain.md` 5.1 에 등재(스키마 소유 BE).
3. **내려 주기** — 탐색 카드 응답(피드·주제별·인기·검색)에 `tags`를 싣는다. 상세 화면은 별도 엔드포인트 없이 카드·라이브러리 항목 데이터로 열리므로(`explore-api.md` 1장), **상세를 여는 라이브러리 항목 응답에도** 싣는다. 태그가 없는 콘텐츠의 표현(빈 배열/생략)은 BE 가 계약으로 정한다.
4. **배포 후 AI 에 알린다** — 운영 배포가 끝나면 파이프라인이 스위치를 켜고 서비스 중인 편에 태그를 소급한다(콘솔 [다시 뽑기 → 반영] — 메타 단독 전송이라 `content_version`·재생 위치 그대로).

## 완료 조건

- Given 형식 3 `enrichment.json`(태그 3개) / When 관리자 업로드 또는 메타 재반영으로 보낸다 / Then `enrichment_applied: true`이고 `contents`에 태그 3개가 저장된다
- Given 태그가 1개이거나 띄어쓰기가 든 형식 3 파일 / When 보낸다 / Then 파일만 거부되고(`enrichment_rejected_reason`) 업로드는 진행된다
- Given 형식 2 파일 / When 보낸다 / Then 종전대로 반영되고 기존 태그는 유지된다
- Given 태그가 있는 콘텐츠 / When 탐색 피드·검색 결과와 라이브러리 항목을 조회한다 / Then 응답에 `tags`가 있다
- Given 이 변경 / When `domain.md`·`admin-api.md`·`explore-api.md`·`library-api.md`를 본다 / Then 형식 3·저장처·응답 필드가 적혀 있다

## 처리 기록

- 2026-10-08 발행(마크다운 + Jira KAN-162). 파이프라인 쪽은 #1303(`feat(ai)/content-hashtags`)이 스위치 `ENRICH_TAGS`(기본 꺼짐)와 함께 먼저 올렸다.
- **2026-10-08 — 반영(반영 날짜 2026-10-08, PR #1304).**
  - 형식 3 수용: `CURRENT_ENRICHMENT_SCHEMA_VERSION` 3, 최상위 키 `tags` 허용(`admin/enrichment-file.ts` `parseTags`). 2~4개 · `^[가-힣A-Za-z0-9]{2,10}$` · 대소문자 무시 중복 없음. 화면에 그대로 보이는 값이라 다른 키처럼 접거나 고치지 않고 **파일만 거부**한다. 생략은 기존 값 유지(부분 갱신), 형식 2 파일은 종전대로.
  - 저장: `contents.tags jsonb NULL`(마이그레이션 `1789300000000-AddContentTags`). NULL = 받은 적 없음.
  - 내려 주기: 탐색 카드(피드·주제별·인기·검색) `content.tags`, 상세 `GET /contents/:id`의 `content.tags`. 없으면 `[]`(null 아님) — 화면이 null 분기를 두지 않게 했다.
  - 문서: `domain.md` 5.1 · `admin-api.md` 4.5·4.6·8장 · `explore-api.md` 4.1 · `content-detail-api.md` 4.1.
- **요청과 달리 한 것 — 라이브러리 항목 대신 상세 응답.** 요청 3항은 "상세 화면은 별도 엔드포인트 없이 카드·라이브러리 항목 데이터로 열린다"(`explore-api.md` 1장)는 전제였는데, 그 문장은 탐색 API에 상세 엔드포인트를 두지 않는다는 뜻이고 상세 화면 자체는 `GET /contents/:id`(`content-detail-api.md`, FE `content-detail.api.ts`)로 연다. 그래서 상세 응답에 싣고 라이브러리 항목(`library-api.md`)에는 싣지 않았다. 완료 조건 4·5항의 "라이브러리 항목"·"`library-api.md`"는 각각 상세 응답·`content-detail-api.md`로 대체 충족한다. 라이브러리 목록에 태그를 보일 계획이 생기면 그때 추가한다.
- 완료 조건 대조:
  - 1~3항(형식 3 저장 · 규칙 밖 파일만 거부 · 형식 2 유지) — E2E `test/content-tags.e2e-spec.ts`(실제 DB, 관리자 메타 재반영 경로)가 밟는다. 형식 3 태그를 뺀 파일도 기존 태그를 유지하는지 함께 본다. 저장 줄을 빼면 이 E2E가 `Received: null`로 실패하는 것을 확인했다.
  - 4항 — 같은 E2E가 상세·검색 카드 응답의 `tags`를 본다(피드·주제별·인기는 같은 `ExploreItemDto`를 쓴다).
  - 5항 — 위 문서 4종에 형식 3·저장처·응답 필드를 적었다.
  - 파서 단위 테스트: 형식 3 수용·생략 시 키 없음 1건, 규칙 밖 9가지(1개·5개·띄어쓰기·'#'·1자·11자·대소문자 중복·문자열 아님·배열 아님) 거부. 백엔드 단위 전체 1,549 통과. 개발계 배포 런(#1304 머지 push)의 검증(실제 DB E2E)·배포·헬스 성공.
- **4항(AI 통지)** — Jira KAN-162 코멘트로 알렸다: 운영 배포 뒤에 `ENRICH_TAGS`를 켤 것(먼저 켜면 운영이 형식 3 파일을 거부), 서버 배포 즉시 콘솔이 발행분을 "구형 v2"로 표시하는 것은 소급 대상 표시라 의도된 동작. FE(KAN-163)에는 응답 계약을 코멘트로 넘겼다.
- 운영 반영은 다음 dev → main 릴리즈에 실린다. 그 뒤 운영 `migrations`에 `AddContentTags1789300000000`이 있는지 확인한다.
