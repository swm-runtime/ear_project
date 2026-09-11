# [AI] 파이프라인 콘솔 — 구형 추천 메타(형식 버전 낮음·없음)인 콘텐츠를 표시·필터한다

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/apps/web`(콘솔 콘텐츠 목록) · 관리자 API `GET /admin/contents` 응답의 `enrichment_schema_version`·`enriched_at` |
| 요청 파트 | AI(파이프라인) |
| 요청자 | Juyear |
| 발행 날짜 | 2026-09-11 |
| Jira | [KAN-54](https://runtime364.atlassian.net/browse/KAN-54) |
| 발견 시점 | 추천 메타 형식 v2 도입 — "이 콘텐츠의 메타가 형식 변경 이후 것인지 이전 것인지"를 콘솔에서 알 수 없다 |
| 근거 문서 | `spec/api/admin-api.md` 8장(`AdminContentItem`의 `enrichment_schema_version`·`enriched_at`, 2026-09-11) · `ai/metadata-pipeline.md` 4.4 |
| 중요도 | **Medium** — 재부여(`enrichment-reextract-console.md`) 대상을 고르는 눈이다. 없으면 전수를 다시 뽑거나 누락한다 |
| 상태 | 대기 — 백엔드가 두 필드를 응답에 싣는 PR 머지 후 착수 가능 |

## 요지

서버는 콘텐츠마다 **마지막으로 적용된 `enrichment.json`의 형식 버전과 시각**(`enrichment_schema_version`·`enriched_at`)을 기록하고 어드민 목록에 싣는다. 현재 형식은 **2**다. 콘솔은 이 값으로 "메타 없음(null) / 구형(2 미만) / 현행(2)"을 구분해 보여주고 필터할 수 있어야 한다.

## 요청 내용

1. 콘텐츠 목록 행에 메타 상태 배지 — `없음`(null) · `구형 v1` · `v2` — 와 `enriched_at`을 표시한다.
2. "구형·없음만 보기" 필터를 둔다 — 재부여 일괄 실행의 대상 선택과 연결한다.
3. 현재 형식 버전 상수는 콘솔이 자기 값으로 두지 않고 **서버가 아는 값**을 기준으로 한다(응답에 현재 버전이 없으면 백엔드에 `GET /admin/contents` 메타에 `current_enrichment_schema_version`을 실어 달라고 요청 — BE 티켓으로).

## 완료 조건

- Given `enrichment_schema_version`이 null·1·2인 콘텐츠가 섞인 목록 / When 콘솔을 연다 / Then 각 행에 없음·구형·v2 배지가 맞게 뜬다
- Given "구형·없음만 보기" 필터 / When 켠다 / Then v2 콘텐츠는 목록에서 빠진다
