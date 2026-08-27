# [BE] 메타데이터 부여 파이프라인 개발 — AI 대본 파이프라인 품질 확정 이후 착수

| 항목 | 값 |
|---|---|
| 대상 | `ai/metadata-pipeline.md`의 구현 — 부여 스킬(`.claude/skills/`) + 서버 저장 반영(`enrichment_file` 업로드 처리 · `content_embeddings` Entity·마이그레이션) |
| 요청 파트 | 백엔드 (추천 고도화 설계 세션에서 발행 — 협의 2026-08-27) |
| 발행 날짜 | 2026-08-27 |
| 발견 시점 | 2026-08-27 추천 3축 하이브리드 설계 확정(README 결정 51) 직후, 착수 시점 협의 |
| 근거 문서 | `ai/metadata-pipeline.md`(절차 소유) · `domain.md` 5.1(추천 메타 4종)·5.6(`content_embeddings`)·15.1 #11(모델·차원 미결) · `features/admin.md` 3.1(`enrichment_file`) · `drip-scheduling.md` 4.2 |
| 심각도 | **하** — 이 파이프라인 없이도 추천은 동작한다(4.2의 축 재정규화 — 임베딩 축·메타 항목이 빠진 채 스코어링). 다만 **없는 동안 고도화의 핵심 축(임베딩 유사도·메타 항목)이 잠자는 상태**이므로, 대본 파이프라인 확정 후 이른 착수가 좋다 |
| 상태 | pending — **착수 보류 중 (아래 선행 조건)** |

## 배경 · 보류 사유

추천 스코어링 고도화(결정 51)의 입력값(추천 메타 4종 + 대본 임베딩)은 **메타데이터 부여 파이프라인**이 대본에서 산출한다(`ai/metadata-pipeline.md` — 앱 밖 운영 절차, 스킬로 실행, origin 무관 전 콘텐츠 대상).

**지금 개발하지 않는 이유** (협의 2026-08-27): 파이프라인의 입력이 대본인데, **AI 대본 파이프라인(`ai/pipeline.md`)이 어떤 품질의 대본을 내는지 아직 확인되지 않았다.** 대본의 형태·분량·문체가 확정되기 전에 메타 판정 기준·임베딩 청크 규칙을 만들면 대본 쪽이 바뀔 때마다 다시 만들게 된다. **대본 파이프라인 확정이 선행 조건이다.**

## 선행 조건 (이것이 풀려야 착수)

1. **AI 대본 파이프라인 확정** — `ai/pipeline.md`로 실제 대본을 N건 생산해 품질·형태가 확정된 상태
2. **임베딩 모델·차원 확정** — `domain.md` 15.1 #11. 미확정 상태로도 메타 4종(Phase A)만 먼저 개발할 수는 있다(`ai/metadata-pipeline.md` 4.3 — Phase B 생략 동작이 정의돼 있다)

## 착수 시 개발 범위

1. **부여 스킬** (`.claude/skills/` — 커밋되지 않는 개인 스킬 또는 팀 공유 방식은 착수 시 결정): `ai/metadata-pipeline.md` 4장의 절차 — Phase A(메타 4종 LLM 판정 — enum은 `domain.md` 5.1과 글자 일치) + Phase B(임베딩, 모델 확정 후) + `enrichment.json` 산출
2. **서버 저장 반영**: 관리자 업로드의 `enrichment_file` 파싱·검증·저장(`admin.md` 3.1 — enum·형식 불일치 시 파일만 거부, 콘텐츠 업로드는 진행) — 관리자 업로드 API 구현 시점과 맞물린다
3. **`content_embeddings` Entity·마이그레이션** (모델 확정 후 — 확정 전 벡터 컬럼 마이그레이션 금지, `domain.md` 15.1 #11) + `user_preference_vectors.taste_embedding` 컬럼 추가 + 스코어링의 임베딩 축 활성화(`drip-scheduling.md` 4.2 ①·4.3-1) + MMR의 임베딩 판정 경로(4.2-3 — 현재는 이산 규칙 폴백만 구현됨)
4. **기존 발행분 소급 부여** — 모델 확정 후 일괄 실행(`ai/metadata-pipeline.md` 미결)

## 완료 조건

- Given 확정된 형태의 대본 1건(origin 무관) / When 부여 스킬을 실행한다 / Then `domain.md` 5.1 enum·형식에 맞는 `enrichment.json`(메타 4종 + 임베딩)이 산출된다
- Given 산출물을 첨부한 관리자 업로드 / When 업로드가 완료된다 / Then `contents` 메타 4종과 `content_embeddings` 행이 저장된다
- Given enum에 없는 값이 든 산출물 / When 업로드 검증이 실행된다 / Then 파일만 거부되고 콘텐츠 업로드는 진행된다
- Given 임베딩이 저장된 콘텐츠와 취향 벡터가 있는 사용자 / When 편성 스코어링이 실행된다 / Then 임베딩 유사도 축이 재정규화 없이 산입된다(`drip-scheduling.md` 4.2 완료 조건과 공유)

## 진행 기록

- 2026-08-27 — 발행. 추천 알고리즘 본체(편성 배치·스코어링·탐험 편성 — 임베딩 축 제외 상태)는 별도로 즉시 개발을 진행한다(`feat(be)/recommendation-enhancement`). 이 티켓은 **입력값을 채우는 쪽**만 다룬다.
