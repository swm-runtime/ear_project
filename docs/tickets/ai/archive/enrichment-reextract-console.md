# [AI] 파이프라인 콘솔 — 발행된 콘텐츠의 추천 메타를 다시 뽑아 반영하는 기능

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/apps/web`(콘솔) · 메타 부여 스킬 실행 경로 · 관리자 API `PATCH /admin/contents/:id`(`enrichment_file` 단독) |
| 요청 파트 | AI(파이프라인) |
| 요청자 | Juyear |
| 발행 날짜 | 2026-09-11 |
| Jira | [KAN-53](https://runtime364.atlassian.net/browse/KAN-53) |
| 발견 시점 | 추천 메타 형식 v2(`target_audiences` — 직군·연차 청자 세트) 도입 결정 — 기존 발행분은 구형 메타로 남는데 콘솔에서 다시 뽑아 넣는 경로가 없다. AI 파트가 "형식 확정 후 다시 뽑는 기능을 추가하겠다"고 한 건 |
| 근거 문서 | `ai/metadata-pipeline.md` 4.4(`schema_version`)·7장(형식 버전 상승) · `spec/api/admin-api.md` 4.10(`enrichment_file` 단독 전송 — 버전 무변경) · `backend/domain.md` 5.1(`enrichment_schema_version`) |
| 중요도 | **Medium** — 출시 전 기존 콘텐츠에 v2 메타를 소급해야 커리어 적합도가 첫날부터 동작한다 |
| 상태 | 완료 |

## 요지

메타 형식이 v2로 바뀌어(`target_audiences` 추가) 이미 발행된 콘텐츠는 구형 메타로 남는다. **서버 쪽 반영 경로는 있다** — 관리자 재발행 `PATCH /admin/contents/:id`에 `enrichment_file`만 첨부하면 오디오·`content_version`은 그대로 두고 메타만 갈아끼운다(재생 위치 보존, 감사 로그 `content.enrich`). 없는 것은 **콘솔에서 발행된 콘텐츠를 고르고 → 그 대본으로 메타 스킬을 다시 돌려 → 그 경로로 보내는 기능**이다.

## 요청 내용

1. 콘솔에서 **발행된 콘텐츠(제품 `contents`)를 대상으로** 메타 부여를 재실행할 수 있게 한다 — 입력은 그 에피소드의 대본(`script.md`)·제목·설명·주제명·origin, 산출은 `enrichment.json`(`schema_version: 2`).
2. 산출물을 `PATCH /admin/contents/:id`에 **`enrichment_file`만** 첨부해 전송한다(다른 파트를 보내면 버전이 올라 전 사용자 재생 위치가 폐기된다 — 4.10).
3. 응답의 `enrichment_applied` / `enrichment_rejected_reason`을 콘솔에 그대로 보여준다(거부 사유는 운영자용 문구).
4. 여러 건 일괄 실행을 지원한다 — 대상 선정은 `tickets/ai/pending/enrichment-schema-version-indicator.md`의 표시와 연결.

## 완료 조건

- Given 구형 메타(`enrichment_schema_version` 1 또는 null)인 발행 콘텐츠 / When 콘솔에서 메타 재부여를 실행한다 / Then `enrichment.json`(v2)이 만들어져 4.10 단독 경로로 전송되고, 응답 200과 `enrichment_applied: true`가 표시된다
- Given 같은 콘텐츠 / When 재부여가 끝난다 / Then `content_version`이 그대로이고 어드민 목록의 `enrichment_schema_version`이 2, `enriched_at`이 갱신된다
- Given 파일이 검증에서 거부된다(값 집합 밖 등) / When 응답을 받는다 / Then `enrichment_rejected_reason`이 콘솔에 노출되고 콘텐츠는 바뀌지 않는다

## 처리 기록

- **반영 날짜**: 2026-09-11 (박수헌 · Claude) — 워커 `enrich` 작업(0021)이 발행 콘텐츠의 대본(백로그 `published_content_ref` → 에피소드 `script.md`, 없으면 4.5 폴백)으로 메타 5종을 판정해 `datasets/enrichment/<content_id>.json` 을 만들고(스킬 `metadata-enrichment` 의 기준 파일을 그대로 프롬프트에 넣음, `finalize.py` 와 같은 정규화·검증), 콘솔 [반영]이 그 파일을 `enrichment_file` 단독으로 PATCH 한다. 응답의 `enrichment_applied`/`enrichment_rejected_reason` 을 행에 표시. 필터 상태에서 [전부 다시 뽑기]로 일괄 요청. 백엔드 선행 PR #322 는 같은 날 오전 머지·배포됨.
- Jira KAN-53 → 완료로 전환.
