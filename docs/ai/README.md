# AI 콘텐츠 제작 — 문서 인덱스

앱 밖에서 **콘텐츠를 만드는 쪽**의 문서를 모은다. 제품 기능이 아니라 운영·제작 절차이므로 [`docs/features/`](../features/)와 층을 분리했다.

이 디렉토리는 **ear 콘텐츠 파이프라인** — 공개 소스에 근거해 고정 진행자 2인(윤아·이음)의 대화형 팟캐스트(편당 15분)를 제작하는 절차 — 의 명세·프롬프트 자산을 담는다. **기준 문서는 [PIPELINE.md](PIPELINE.md)** 다 (2026-08 개편 — 구 `pipeline.md`를 대체). 이 절차를 실행하는 코드(웹 UI·워커·운영 DB 스키마)는 파트 [`pipeline/`](../../pipeline/README.md)에 있고, **워커는 이 디렉토리를 프롬프트 자산 루트(ASSET_ROOT)로 직접 읽는다** — 사본을 두지 않는다.

## 문서 지도

| 문서 | 범위 |
|---|---|
| [PIPELINE.md](PIPELINE.md) | **종합 명세 · 인덱스** — 개요·주제 체계, 전체 흐름·상태 전이, 불변 원칙 7개, 시스템 구성, 역할 분담, 미결 총괄 |
| [PIPELINE-STATUS.md](PIPELINE-STATUS.md) | 실행 현황 — 운영 DB 가동 상태, 품질 사이클 진행 기록, 파일럿 제작 이력 |
| **spec/** — 단계별 세부 규칙 | |
| [spec/01-source-pool.md](spec/01-source-pool.md) | 소스 풀 — 계층(1군/2군/차단/보류/후보), 편입 워크플로·판정 체크리스트, 법적 안전 규칙 |
| [spec/02-sweep.md](spec/02-sweep.md) | 스윕 — RSS 정기 스윕(모드 A)·주제 탐색(모드 B), "메타데이터만" 수집 규약, `sources` 적재 |
| [spec/03-backlog.md](spec/03-backlog.md) | 군집화·백로그·게이트 1 — 군집 기준(주제 축), 후보 구성, 상태 전이, 분할 반환, 승인 자동화 단계 |
| [spec/04-script.md](spec/04-script.md) | 대본 — 원문 정독 절차, **2인 대화체 포맷·페르소나(윤아·이음)**, 금지 규칙, 구조·분량, 낭독 규격, claims 규격 |
| [spec/05-qa.md](spec/05-qa.md) | QA — 검사 항목 10개, 독립 실행 규약, 재생성 정책(최대 3회), 자동화 로드맵, 심은 오류 프로브 |
| [spec/06-audio.md](spec/06-audio.md) | 오디오 — ElevenLabs v3 규격(보이스·합성 방식·태그), 대본→TTS 변환(음차 치환), 후처리·파일 규격 |
| [spec/07-publish.md](spec/07-publish.md) | 패키지·게이트 2·발행 — 검수 체크리스트, 누검출 기록, 검수 자동화 단계, 발행 후 처리 |
| [spec/08-infra.md](spec/08-infra.md) | 인프라 — Supabase 데이터 계층, S3 저장 계층, 실행기 로드맵(스킬 → API 워커 → 배치), 웹 UI, 로컬 모델 전환 설계 |
| [spec/09-quality-cycle.md](spec/09-quality-cycle.md) | 품질 개선 사이클 v2 — 하한/상한 분리, L0~L3 4층 평가, 회귀 세트, κ 승격 조건, 프롬프트 버전 관리, 연동 자산 갱신 절차 |
| [spec/10-webapp.md](spec/10-webapp.md) | 웹 UI·워커 — `jobs` 큐, 상태 연쇄, 실행기 규약(`claude -p` / API 실행기 목표), 화면, 저장소 구조(`pipeline/`), 마일스톤 M1~M6, `ai-server/`와의 역할 정렬 |
| **skills/** — 프롬프트 자산 (spec의 실행 이식본) | |
| [skills/draft/guidelines.md](skills/draft/guidelines.md) | 대본 생성 가이드라인 (`full-vN`) · [CHANGELOG](skills/draft/CHANGELOG.md) · [style-directions](skills/draft/style-directions.md) · [examples/](skills/draft/examples/) 골드 대본 3종 |
| [skills/critic/rubric.md](skills/critic/rubric.md) · [rubric-v2.md](skills/critic/rubric-v2.md) | 비평 루브릭 (`critic-vN`) — v1.x 현행 · v2 초안(100점 12항목·판단 플래그 20·앵커 자리) |
| [skills/qa/prompt.md](skills/qa/prompt.md) | QA 실행 프롬프트 (`qa-vN`) — spec/05의 이식본 |
| **기타** | |
| [pipeline/supabase/schema.sql](../../pipeline/supabase/schema.sql) · [migrations/](../../pipeline/supabase/migrations/) | 운영 DB 스키마 — 스냅샷 + 적용 이력 0002~ (`topics`·`domains`·`sources`·`backlog`·`runs`·`jobs`·`episodes`·`settings`). 코드 파트 `pipeline/` 소유 |
| [references/](references/) | 롤모델 쇼 전사본 **분석 노트**(전사본 원문 .txt 는 레포 밖) — 스타일 디렉션의 근거 |
| [templates/feedback-template.md](templates/feedback-template.md) | 대본 피드백 템플릿 (spec/09 3장) |
| [metadata-pipeline.md](metadata-pipeline.md) | **하류 절차** — 대본에서 추천 메타 4종·임베딩을 산출해 `enrichment.json` 생성. origin 무관 전 콘텐츠 대상. 구현: `.claude/skills/metadata-enrichment/` |

## 상황별 참조

| 상황 | 참조 |
|---|---|
| 파이프라인 전체를 처음 이해 | PIPELINE.md 1~3장 → 관심 단계의 spec |
| 도메인 편입·판정 (사람) | spec/01 4장 체크리스트 → 웹 UI `/domains` (spec/10 — 자동 확인 `domain_check`는 보조 증거) |
| 스윕·군집화 실행 | spec/02 · spec/03 — 실행은 웹 `/sweep` 요청 → 워커 (spec/10) |
| 후보 승인 (게이트 1) | spec/03 6장 |
| 대본 생성 | spec/04(규격) + skills/draft/guidelines.md(현행 프롬프트) + examples/(골드) |
| QA 실행 | skills/qa/prompt.md — **새 컨텍스트에서** (spec/05 5장 독립 실행 규약). 워커가 `claude -p` 새 프로세스로 자동 연쇄 (spec/10 3장) |
| 비평·피드백·프롬프트 개정 | spec/09 → skills/critic/rubric.md · templates/feedback-template.md → CHANGELOG 갱신 |
| 최종 검수·발행 (게이트 2) | spec/07 3장 체크리스트 → spec/06 TTS → 관리자 업로드 |
| 추천 메타 부여 | metadata-pipeline.md (`packaged` 직후) |
| DB 컬럼·enum 확인 | `pipeline/supabase/schema.sql` (+ `migrations/`) |
| 웹 UI·워커 코드 | spec/10 → [`pipeline/`](../../pipeline/README.md) |
| 현재 어디까지 왔나 | PIPELINE-STATUS.md |

## 문서 간 우선순위

1. **PIPELINE.md 3장 불변 원칙** — 단계 명세가 바뀌어도 유지되는 상위 규칙
2. **spec/NN** — 단계별 확정 규칙. 미결은 spec에 적지 않고 PIPELINE.md 7장에만 모은다
3. **skills/** — spec의 실행 이식본. **spec와 어긋나면 프롬프트가 아니라 명세를 함께 개정한다** (spec/09 4장). 규칙 승격 시 guidelines·rubric을 함께 갱신한다
4. 버전 표기: 대본 `full-vN` · 비평 `critic-vN` · QA `qa-vN` — 모든 실행은 `runs.prompt_version`에 기록한다

## features/·backend/와의 경계

| | `docs/features/` | `docs/ai/` |
|---|---|---|
| 다루는 것 | 사용자에게 노출되는 제품 기능 | 콘텐츠를 만드는 앱 밖 절차 |
| 산출물 | 앱 화면·API·스키마 | 대본·claims·QA 리포트·오디오·업로드 메타 |
| 상태·데이터 | 제품 DB — [`backend/domain.md`](../backend/domain.md)가 기준 | 파이프라인 운영 DB (Supabase) — [`pipeline/supabase/schema.sql`](../../pipeline/supabase/schema.sql)이 기준. 제품 인프라와 **완전 분리** |
| 구현 위치 | `backend/` · `frontend/` | 프롬프트 자산 = `docs/ai/skills/` · 실행체(웹 UI·워커·큐·운영 DB 스키마) = **`pipeline/`** (spec/10 — 워커가 `docs/ai/`를 ASSET_ROOT로 읽는다) · 모델 추론 API(임베딩 등) = `ai-server/` (같은 EC2에 동거 — spec/10 2장 정렬) · 메타 부여 스킬 = `.claude/skills/metadata-enrichment/` |

- 제품과의 접점은 둘뿐이다: 발행 오디오의 제품 서빙 버킷 복사(spec/08 2장), 관리자 업로드(spec/07 4장 — [`features/admin.md`](../features/admin.md) 3.1).
- [`features/content-pipeline.md`](../features/content-pipeline.md)(P1 자동 파이프라인 설계)는 이 개편 이전의 규칙을 담고 있다. **대본 형식("라디오 형식 대본")·상태 저장(파일) 등이 현행과 어긋나므로** 통합 시 [`docs/changes/`](../changes/)의 `pending/` 개정 요청으로 정리한다. 그때까지 제작 절차의 기준은 이 디렉토리다.

## 커밋하지 않는 것

작업 폴더(워커의 WORK_ROOT — 레포 밖)에는 있으나 레포에 넣지 않는다 (상태의 원본은 운영 DB, 산출물은 S3 이관 예정 — spec/08 2장, spec/10 M4):

- `episodes/` — 제작 산출물 (대본·claims·발췌·QA/비평 리포트·피드백). **발췌(`sources.md`)는 재배포 금지 증적**이다
- `sources/sweeps/` · `backlog/*.md` — 스윕 원본·로컬 백로그 기록 (DB 이관 완료분)
- `references/*.txt` — 롤모델 쇼 전사본(저작권). 구조 **분석 노트만** [`references/`](references/)에 있다
- `archive/` — 2026-08 개편 이전의 제안·검토 문서·시드 파일·골드 백업

검수 이행 증적은 `runs`와 상태 전환 기록(`approved_by`·`decided_by` 등)이 담당한다.
