# [AI] 주제 기획(B-②)을 서버 워커로 — 노트북 Claude 의존 제거(글로벌처럼 OpenAI 웹 검색 실행기)

| 항목 | 값 |
|---|---|
| 대상 | 워커 집기 조건(`worker/src/index.ts` 0025) · `executors/openai-search.ts` 생성 조건(en 한정 → 한국판 포함) · `stages/topic-seed.ts`·`reinforce.ts` · 한국어 검색 프롬프트(`buildTopicSeedSearchPrompt`) · `runs` 기록 · `docs/ai/spec/02-sweep.md` 6장 · `spec/10-webapp.md` 0025 · `PIPELINE.md` 자동화 현황·미결 3 · `deploy/docker-compose.prod.yml` 주석 |
| 요청 파트 | AI 파이프라인 |
| 요청자 | 이주호(PM) |
| 담당 | 박수헌 |
| Jira | [KAN-222](https://runtime364.atlassian.net/browse/KAN-222) |
| 발행 날짜 | 2026-10-16 |
| 시작 날짜 | 2026-10-16 |
| 기한 | 2026-10-19 (Medium — 3일 안) |
| 선행 | 없음 — [KAN-209](https://runtime364.atlassian.net/browse/KAN-209) OpenAI 웹 검색 실행기(PR #1541) 머지됨, 한국판 서버에 `OPENAI_API_KEY` 있음 |
| 관련 | [KAN-209](https://runtime364.atlassian.net/browse/KAN-209) 글로벌 기획 입구(같은 실행기를 en에서만 생성) · [KAN-179](https://runtime364.atlassian.net/browse/KAN-179) 사용자 주제 추천 기획 — 들어오는 주제가 늘면 이 경로를 탄다 |
| 근거 문서 | `docs/ai/spec/02-sweep.md` 6장(B-②·B-①) · `spec/10-webapp.md` 운영 규칙 0025·`server_ai_claim` · `PIPELINE.md` 불변 원칙 2 예외(2026-09-26)·자동화 현황 · 글로벌 명세 4.4(서버 API 실행기만) |
| 중요도 | Medium — PM이 따로 정하지 않아 기본값. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |
| 상태 | 대기 |

## 배경

한국판 **주제 기획**(콘솔 스윕·군집화 › 주제 기획 → `sweep {mode:"B2", mid_topic, topic, hint}`, spec/02 6장 B-②)은 검색 단계에 WebSearch가 필요해 **Claude CLI 워커(노트북)만 집는다** — spec/10 규칙 0025, `worker/src/index.ts`의 집기 조건 `cfg.executor !== "openai" || pipelineLocale() === "en"`. 노트북이 꺼져 있으면 콘솔에서 넣은 기획이 대기만 한다.

글로벌판은 KAN-209(PR #1541, 2026-10-15)에서 **OpenAI 웹 검색 실행기**(`executors/openai-search.ts` — `web_search` 도구 하나인 요청만 받음 · `max_tool_calls` 8 · `filters.blocked_domains` · 검색 1회 $0.01 · 도구가 실제로 본 URL만 적재)를 붙여 **서버 워커가 집는다** — 단 `PIPELINE_LOCALE=en`에서만 생성되고 한국판 `OpenAiExecutor`는 종전대로 도구 요청을 거절한다.

PM(이주호) 요청 2026-10-16 14:26 Slack: "주제기획을 파이프라인 내부에 탑재하게 하면 안 되나요? global처럼. 지금은 클로드랑 연결해서 하고 있는데 AI 서버 내부로 옮기면." 박수헌 "바꿔드릴게요 — 티켓 부탁".

## 요청 내용

1. **집기 조건** — 한국판 서버 워커(`EXECUTOR=openai`, `CAPABILITIES=ai,io`)도 도구 작업(sweep B·B2)을 집는다. `|| en`을 `true`로 바꾸는 게 아니라 **"실행기가 WebSearch-only 요청을 처리할 수 있는가"**로 묶는다 — OpenAI 웹 검색 실행기 생성 조건을 en 한정에서 풀고, `claim_job(p_can_tools)`는 그 실행기 유무를 따른다. `EXECUTOR=none`(IO 전용)은 종전대로 안 집는다.
2. **B-①(보강)도 같은 경로** — 보강(`reinforce.ts`)도 WebSearch-only 요청이라 같이 서버로 넘어간다. 기본은 둘 다. 분리하려면 사유를 적는다.
3. **한국어 검색 프롬프트 확인** — `buildTopicSeedSearchPrompt`(ko)는 Claude WebSearch 전제로 쓰였다. OpenAI `web_search`에서 한국어 질의 품질·풀 호스트 우선·차단 도메인 필터·`in_pool` 판정이 동작하는지 **기획 1건 완주**로 확인한다. 판정 단계(군집화 v2, 단발)는 이미 OpenAI 경로다. 프롬프트를 고치면 `prompt_version`을 올린다.
4. **노트북 워커와 공존** — 둘 다 집을 수 있게 되면 중복은 `claim_job` 원자성으로 안전하다. 전환 기간 운영 방식은 담당이 정한다: (가) 노트북 워커가 B-②·B-①을 집지 않게 하고 서버만 / (나) 둘 다 두고 `runs.executed_by`로 구분해 품질 비교 뒤 전환. 정한 쪽을 spec/10에 적는다. 종전 `settings.automation.server_ai_claim` 스위치(false면 서버가 `sweep` 전체를 안 집음)와의 관계도 함께 적는다.
5. **비용·기록** — `runs.result`에 글로벌과 같은 `web_search` trace(호출·검색 수·질의·본 URL)와 비용을 남긴다. 콘솔 진행 표시 "기획 1/2 — 검색 N회" 유지. 한국판 OpenAI 프로젝트 예산에 검색 비용(건당 최대 8회 × $0.01 + 토큰)을 반영한다.
6. **문서** — spec/02 6장 B-②·B-① "현재 운영: 노트북 Claude 워커(WebSearch)" → 서버 워커, spec/10 규칙 0025 개정, `PIPELINE.md` 자동화 현황("현재: 스킬 + 사람 트리거") · 미결 3(검색 엔진 — Claude web_search vs Perplexity → OpenAI web_search로 확정이면 닫기), `topic-seed.ts`·`reinforce.ts` 머리 주석("Claude CLI 워커만 집는다"), `docker-compose.prod.yml` EXECUTOR 주석. 개발 중이면 `changes/pending/`에 기록하고 통합 시 반영.

## 완료 조건

- Given 한국판 서버 워커(`EXECUTOR=openai`, `ai,io`)만 켜져 있고 노트북 워커 꺼짐 / When 콘솔 주제 기획에 중분류·주제 입력 / Then 서버 워커가 `sweep B2`를 집어 검색 → 판정까지 끝내고 백로그에 🔎 후보(`proposed` 또는 `held`)가 생긴다
- Given 같은 조건 / When 백로그 [보강] / Then 서버 워커가 `sweep B`를 집어 끝낸다
- Given 검색 결과에 차단·보류 도메인 / Then `sources`에 들어가지 않는다(블록 필터 동작)
- Given 완주한 작업 / When `runs` 조회 / Then `executed_by`가 서버 워커, `web_search` trace·비용·`prompt_version`이 있다
- Given `EXECUTOR=none` 워커 / Then 종전대로 B·B2를 집지 않는다
- Given 글로벌 인스턴스(`en`) / Then 동작 변화 없음(워커·웹 테스트 통과)
- Given 문서 / Then B-②·B-①의 "노트북 Claude만" 문장이 없고 서버 경로·전환 운영 방식이 적혀 있다

## 처리 기록

- 2026-10-16 발행(마크다운 + Jira KAN-222). PM Slack 요청 → 박수헌 수락.
- 2026-10-16 코드 반영(브랜치 `feat(ai)/kr-topic-planning-server`).
  - **실행기**: `EXECUTOR=openai`이면 언어와 무관하게 `OpenAiSearchExecutor`를 쓴다. 단발 호출은 부모 경로 그대로다.
  - **집기 조건**: `executorHandlesWebSearch(kind)`로 판정한다. claude-cli·openai는 집고, api·none은 집지 않는다. 종전 조건은 `executor !== "openai" || en`이었다.
  - **B-① 보강도 같은 경로**: 둘 다 WebSearch만 쓰는 검색 단계라 나누지 않았다.
  - **기록**: `runs.tokens`에 `web_search`(호출·검색 수·검색어·본 URL·보낸 차단 도메인 수·버린 URL)를 남긴다. `runs.result`의 "검색 N회"는 실행기가 실제로 친 검색어 수다.
  - **전환 운영 방식(박수헌 결정)**: 운영은 서버 워커만 쓴다. 노트북 워커는 켜지 않고, 실험·측정할 때만 켠다.
  - **`server_ai_claim` 스위치**: 비용 비상 정지용으로 남겼다. 끄면 노트북 없이는 AI 작업이 전부 멈춘다는 경고를 콘솔 설정에 붙였다.
  - **한국어 검색 프롬프트**: 손대지 않았다. 실행기 중립 문구이고, 스키마가 글로벌판과 같은 모양(`queries`·`sources[].url`)이다. 실측 1건에서 문제가 보이면 그때 고치고 `prompt_version`을 올린다.
  - **문서**: spec/02 6장, spec/10 2장·4장, PIPELINE.md 실행기 블록·미결 3(해소), deploy README·env.prod.example·compose 주석을 고쳤다.
  - **테스트**: 워커 186, 웹 62. 실행기 선택 테스트를 새 동작으로 바꿨다. 한국판 바이트 대조 결과는 동일하다.
  - **남은 것**: 배포 뒤 한국판 서버에서 주제 기획 1건·보강 1건을 완주한다(완료 조건 1·2·3·4). 확인되면 archive와 Jira 완료로 넘긴다.
- 2026-10-16 반영 완료(#1625, dev 배포). 반영 날짜 2026-10-16.
  - 한국판 서버 실측: C277 보강과 C284 주제 기획을 둘 다 `ai-server-io`(openai)가 완주했다.
  - 두 건 모두 비용 $0.14, 실제 검색 호출 3회였다. 차단 도메인 63개를 검색 단계에 보냈고 소스 혼입은 0건이다. `runs.tokens.web_search`가 기록됐다.
  - C277은 수치·조사 역할을 채웠지만 한 발행처가 83%라 보류를 유지했다. C284는 성립(proposed)했다.
  - 전환 운영 방식은 서버 워커만이다. 노트북 워커는 실험용이다.
  - 완료 조건 5(EXECUTOR=none은 집지 않는다)와 6(글로벌판 동작 무변경)은 단위 테스트로 확인했다.
