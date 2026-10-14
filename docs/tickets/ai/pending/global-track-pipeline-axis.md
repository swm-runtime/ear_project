# [AI] 글로벌 2 — 트랙 축: `track` 컬럼·에피소드 ID 접두사·콘솔 필터 · `ASSET_PROFILE=en`·`skills-en`/`spec-en` 초판·페르소나 추상화

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/supabase/schema.sql`(`domains`·`sources`·`backlog`·`episodes`·`topics` 미러 `track`) · `assets.ts PROFILE_KEYS` · `docs/ai/skills-en/{draft,qa,critic,tts,thumbnail}` · `docs/ai/spec-en/04,05,06` · `topics.explainer` CHECK·`Speaker`·`voiceOf()`·`settings.templates` · `docs/ai/PIPELINE.md`(트랙 개념) |
| 요청 파트 | AI 파이프라인 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박수헌 |
| Jira | [KAN-201](https://runtime364.atlassian.net/browse/KAN-201) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 (Medium) |
| 선행 | [KAN-200](https://runtime364.atlassian.net/browse/KAN-200) `global-track-decisions.md`(진행자·보이스) |
| 관련 | 한국어 트랙 자산 불변 — 기존 회귀 세트가 그대로 통과해야 한다 |
| 근거 문서 | **`spec/api/global-api.md` 해당 없음(파이프라인 내부). 발행 필드는 4번** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- `track`(`ko | global`) 컬럼 마이그레이션 1건. 에피소드 ID 접두사 분리(예 `G{YYMMDD}-nnn`) — S3 키·중복 대조가 갈린다. 콘솔에 트랙 필터.
- `ASSET_PROFILE`을 "프로파일 → 키 매핑 맵"으로 일반화해 `=en`이 `docs/ai/skills-en/*`·`spec-en/*`을 읽는다.
- `skills-en` 초판: guidelines 영어판(언어 종속 규칙 19·16·24·6 제거, 영어 구어체 규칙 신설) · QA 항목 5·6·10 영어판 · rubric F군·3.8 영어판. 사실 검증 항목 1~4·8·9는 공유.
- 페르소나 추상화: `topics.explainer` CHECK(`'윤아','이음'`)·`Speaker` 타입·`voiceOf()`·인트로/클로징 템플릿을 **트랙별 페르소나 설정**으로.
- `PIPELINE.md`에 트랙 개념 한 절.

## 범위 밖

L0·TTS 분기(3번)

## 완료 조건

- Given `ASSET_PROFILE=en` / When 워커 기동 / Then `skills-en/*`만 읽고 한국어 자산 참조 0건(로그)
- Given `ASSET_PROFILE` 기본값 / Then 기존 회귀 세트 전부 통과(한국어 트랙 불변)
- Given 영어 트랙 에피소드 / Then ID가 `G` 접두사, S3 키 충돌 0건
- Given 콘솔 / Then 트랙 필터로 두 트랙이 분리돼 보인다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
