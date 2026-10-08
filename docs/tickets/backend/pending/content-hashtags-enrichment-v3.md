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
| 상태 | 대기 |

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
