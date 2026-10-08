# [AI] 콘텐츠 태그 붙이기

| 항목 | 값 |
|---|---|
| 대상 | 태그 체계 · 파이프라인 태그 부여 · 기발행 소급 · (노출 시) FE·BE 티켓 |
| 요청 파트 | AI(파이프라인) |
| 요청자 | 이주호(PM) |
| 담당 | 박수헌 |
| Jira | [KAN-139](https://runtime364.atlassian.net/browse/KAN-139) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 앱 노출·소급: BE `content-hashtags-enrichment-v3.md`(추천 메타 형식 3 수용) · FE `content-hashtags-display.md` — 2026-10-08 작성, Jira 미발행 |
| 근거 문서 | `ai/metadata-pipeline.md`(enrichment — keywords·target_audiences 등) · `features/explore.md` · `features/content-detail.md` |
| 중요도 | Low — PM 발행(2026-10-05). 중요도 미지정이라 이번 주 마감으로 잡았다 — 바꾸려면 Jira·이 표를 함께 고친다 |
| 상태 | 진행 중 — 체계·부여 규칙·파이프라인 부여 반영(스위치 꺼짐), BE 형식 3 반영 대기 |

## 무엇을 한다

1. **태그 체계 결정** — 기존 추천 메타(`enrichment.json`의 keywords·target_audiences 등)를 태그로 쓸지, 표시용 태그를 따로 둘지
2. **부여** — 신규 발행분은 파이프라인에서, 기존 발행분은 소급
3. **노출** — 앱에 보여준다면 위치(상세·탐색)를 FE와 맞추고 필요하면 FE·BE 티켓을 따로 낸다

## 완료 조건

- Given 결정 / When `ai/metadata-pipeline.md`(또는 새 절)를 본다 / Then 태그 체계와 부여 규칙이 적혀 있다
- Given 신규·기존 발행 콘텐츠 / When 메타를 조회한다 / Then 태그가 붙어 있다
- Given 앱 노출을 하기로 했다면 / When 요청 문서를 본다 / Then FE·BE 티켓이 발행돼 있다

## 처리 기록

### 2026-10-08 — 1·2번 파이프라인 쪽 반영, BE·FE 티켓 작성

- **PM 의도 확인(박수헌 경유)**: 주제 분류와 별개로 SNS 해시태그처럼 내용에 맞는 태그를 **최소 2개, 최대 4개** 뽑아 **탐색 카드와 상세 화면**에 띄운다. 탭 동작은 FE 가 정한다. 지명은 웬만하면 쓰지 않고, 4개를 채우려고 맞지 않는 태그를 넣지 않는다
- **1 체계 결정**: 기존 `keywords`(추천용 세부 개념 — "중국계 외국인투자 기업"처럼 그 편에만 쓰는 긴 말, 편당 평균 7개)는 화면 태그로 맞지 않는다 → **표시용 `tags`를 따로 둔다**. 같은 판정 호출·같은 `enrichment.json`(형식 3)으로 낸다. 규칙은 `ai/metadata-pipeline.md` 1장 3항·4.2·4.4, 세부는 스킬 `judgment-criteria.md` tags 절
- **파일럿** (서버 메타 부여와 같은 gpt-5.6-terra, 서비스 중 12편, `pipeline/.work/content-tags/`): 1차는 12편 전부 4개를 채우고 지명(#베트남 #중국 #히로시마)·붙여 만든 학술어(#보스턴통신위원회)가 섞임 → 개수·지명·학술어 규칙을 넣은 2차는 3~4개로 갈리고 지명이 빠짐(#원폭투하). #처비 #통신위원회처럼 낯선 말은 남아 운영하며 다듬는다
- **2 부여**: 워커 메타 부여 단계가 태그를 함께 판정한다(`enrich-v2`). 서버가 형식 3을 받기 전까지 스위치 `ENRICH_TAGS`(기본 꺼짐)로 파일에 싣지 않고 리포트(`enrichment.report.json`의 `tags`)에만 남긴다 — 서버는 모르는 키·높은 형식을 파일째 거부한다(`admin-api.md` 4.6). 규칙 밖 태그는 그 태그만 빼고 2개 미만이면 키를 뺀다
- **3 노출**: BE `content-hashtags-enrichment-v3.md`(형식 3 수용·저장·카드/라이브러리 응답) · FE `content-hashtags-display.md`(탐색 카드·상세 표시) 작성 — Jira 발행은 요청 시
- **남은 것**: BE 운영 배포 → `ENRICH_TAGS` 켬 + 콘솔 `ENRICHMENT_SCHEMA_VERSION_FALLBACK` 3 → 서비스 중 편 [다시 뽑기 → 반영]으로 소급(메타 단독 전송 — 버전·재생 위치 그대로) → FE 표시 확인 뒤 archive
