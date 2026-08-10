# AI 콘텐츠 제작 — 문서 인덱스

앱 밖에서 **콘텐츠를 만드는 쪽**의 문서를 모은다. 제품 기능이 아니라 운영·제작 절차이므로 [`docs/features/`](../features/)와 층을 분리했다.

| 문서 | 범위 |
|---|---|
| [pipeline.md](pipeline.md) | AI 자체 생성 콘텐츠 제작 — 주제 발굴 → 승인 → 소스 수집 → 대본 → QA → 업로드 패키지 |

구현은 [`.claude/skills/ai-content-authoring/`](../../.claude/skills/ai-content-authoring/)에 있다. **명세가 기준이고 스킬이 그 구현이다** — 어긋나면 스킬이 틀린 것이다.

명세는 `docs/prd/next_doing.md` 2장의 **8항목 템플릿**을 따른다. 사용자 화면이 없으므로 5번 항목은 [`features/README.md`](../features/README.md)의 규칙대로 **"상태 전이 · 운영 노출"** 로 대체한다.

## features/와의 경계

| | `docs/features/` | `docs/ai/` |
|---|---|---|
| 다루는 것 | 사용자에게 노출되는 제품 기능 | 콘텐츠를 만드는 앱 밖 절차 |
| 산출물 | 앱 화면·API·스키마 | 대본·QA 리포트·업로드 메타 파일 |
| 구현 위치 | `backend/` · `frontend/` | `.claude/skills/` |

- [`features/content-pipeline.md`](../features/content-pipeline.md)는 **P1 자동 파이프라인의 설계**이고, 이쪽은 **MVP 수작업 절차**다. 겹치는 규칙(분할·환각 금지·출처 고지·QA 항목)의 원본은 `content-pipeline.md`이며 여기서는 참조만 한다.
- 스키마는 [`backend/domain.md`](../backend/domain.md)가 유일한 기준이다. 이 영역의 문서는 테이블을 정의하지 않는다.
- 규칙이 상위 문서와 충돌하면 이쪽을 고치지 않고 [`docs/changes/pending/`](../changes/pending/)에 개정 요청을 올린다.

## 산출물은 커밋하지 않는다

제작 실행 결과(`runs/` 아래의 대본 초안·QA 리포트·업로드 메타)는 레포에 넣지 않는다. 레포 자산이 아니고, 검수 이행 증적은 `audit_logs`의 업로드 기록이 담당한다([`features/admin.md`](../features/admin.md) 4.2-1).
