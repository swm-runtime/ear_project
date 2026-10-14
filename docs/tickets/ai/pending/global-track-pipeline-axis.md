# [AI] 글로벌 2 — 로케일 축: `PIPELINE_LOCALE` 분기·에피소드 ID 접두사·페르소나 추상화·영어 규칙 자산 v0

| 항목 | 값 |
|---|---|
| 대상 | 워커·웹 설정(`PIPELINE_LOCALE` — `ko` 기본·`en`) · 자산 로더(`assets.ts`)·`ASSET_ROOT` 명세 장 경로 · `topics.explainer` CHECK·`Speaker`·`voiceOf()`·`settings.templates` · 에피소드 ID 발급 · `docs/ai/global/spec/`(프롬프트용 명세 장) · 글로벌 인스턴스 `prompt_assets` v0 · `docs/ai/PIPELINE.md`(글로벌판 링크 한 줄) |
| 요청 파트 | AI 파이프라인 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박수헌 |
| Jira | [KAN-201](https://runtime364.atlassian.net/browse/KAN-201) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 (Medium) |
| 선행 | [KAN-200](https://runtime364.atlassian.net/browse/KAN-200) `global-track-decisions.md` — 페르소나 이름·보이스 **값**만 막힌다. 추상화·로케일 분기는 선행 없이 시작할 수 있다 |
| 관련 | 한국어 트랙 자산 불변 — 기존 회귀 세트가 그대로 통과해야 한다 · 인스턴스 인프라는 [KAN-208](https://runtime364.atlassian.net/browse/KAN-208) `global-instance-infra.md` · 이 티켓이 [KAN-209](https://runtime364.atlassian.net/browse/KAN-209) 기획 입구를 막는다 |
| 근거 문서 | **`docs/ai/global/PIPELINE.md` 4.2·4.3·4.5·6.4** — 구현은 이 문서를 따르고, 결정이 바뀌면 티켓이 아니라 이 문서를 고친다 |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 앱·서버 결정은 `spec/api/global-api.md`가, 파이프라인 결정은 `docs/ai/global/PIPELINE.md`가 원본이다. **티켓과 명세가 다르면 명세를 따른다.**

## 무엇을 한다

- **`PIPELINE_LOCALE`** (`ko` 기본 · `en`) — 코드는 하나, 인스턴스는 둘(명세 4.2). 언어 종속 교체점(명세 4.3)이 이 값 하나로 갈리게 분기 자리를 만든다. L0·TTS의 실제 영어 규칙은 3번 티켓.
- **자산** — 글로벌 인스턴스는 자기 DB의 `prompt_assets`만 읽는다(DB가 따로라 프로파일 키 매핑은 필요 없다). 워커 프롬프트에 들어가는 명세 장은 `en`일 때 `docs/ai/global/spec/`에서 읽는다.
- **영어 규칙 자산 v0** — guidelines · QA 프롬프트 · 루브릭 · 템플릿을 **영어 대본 기준으로 새로** 쓴다(한국판 번역·발췌가 아님, 명세 4.5). 사실 검증 QA 항목(1~4·8·9)은 구조를 승계하되 국문 발췌 → 영어 재서술의 의미 변형을 판정 대상에 넣는다(명세 6.5).
- **페르소나 추상화** — `topics.explainer` CHECK(`'윤아','이음'`)·`Speaker` 타입·`voiceOf()`·인트로/클로징 템플릿을 **인스턴스 설정**으로 뺀다. 이름·보이스 값은 1번 결정 뒤 채운다.
- **에피소드 ID 접두사 `G`** (예 `G261014-001`) — 버킷이 달라 충돌 방지용은 아니고, 사람이 Slack·로그에서 두 트랙을 구분하기 위한 것이다.
- 한국판 `docs/ai/PIPELINE.md`에 글로벌판 명세 링크 한 줄.

## 범위 밖

- L0·TTS 영어 규칙(3번)
- 인스턴스 인프라(`global-instance-infra.md`)
- ~~`track` 컬럼·콘솔 트랙 필터~~ — DB·콘솔이 인스턴스별로 따로라 필요 없다(명세 4.1)

## 완료 조건

- Given `PIPELINE_LOCALE` 미설정 / Then 기존 회귀 세트 L0·TTS 입력 결과가 교체 전과 같다(한국어 트랙 불변)
- Given `PIPELINE_LOCALE=en` 인 워커 / When 대본 생성·QA·비평 프롬프트를 조립한다 / Then 들어가는 규칙·명세 장이 전부 영어 자산이고 한국판 자산 참조가 0건이다(로그)
- Given `en` 인스턴스의 에피소드 / Then ID가 `G` 접두사다
- Given 페르소나 설정 / Then 화자 이름·보이스가 코드 상수가 아니라 인스턴스 설정에서 온다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-14 명세 우선 정리 — 분리 단위가 "같은 DB에 `track` 컬럼"이 아니라 **코드 공유 + 인스턴스 분리(`PIPELINE_LOCALE`)**로 확정돼(명세 4.2) `track` 컬럼·콘솔 트랙 필터·`ASSET_PROFILE` 키 매핑을 뺐다. 자산 경로는 `skills-en/`·`spec-en/` 대신 `docs/ai/global/spec/`, 작성 방식은 한국판에서 언어 종속 규칙을 빼는 것이 아니라 영어 대본 기준 신규 작성으로 바꿨다.
