# [AI] 글로벌 4 — 주제 기획 생산·도메인 사후 판정·영어 메타(`enrichment` language·태그·`target_audiences`)·`upload-meta` market/language · 5편 단위 테스트 → 오픈 전 40편

| 항목 | 값 |
|---|---|
| 대상 | 주제 기획 입력(B-②) · 후보에 딸려 온 `candidate` 도메인 판정 · `enrichment.json` 영어 기준 · 워커 태그 규칙(`ENRICH_TAG_RE`) · `upload-meta.json` `market/language` · 영어 검수(게이트 2) |
| 요청 파트 | AI 파이프라인 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박수헌 |
| Jira | [KAN-202](https://runtime364.atlassian.net/browse/KAN-202) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-24 (Medium 환산은 발행+3일(10-17)이나 선행 티켓 뒤 착수라 10일 계획의 마일스톤 날짜로 적음) |
| 선행 | [KAN-203](https://runtime364.atlassian.net/browse/KAN-203) · [KAN-200](https://runtime364.atlassian.net/browse/KAN-200) · [KAN-208](https://runtime364.atlassian.net/browse/KAN-208) `global-instance-infra.md` · [KAN-209](https://runtime364.atlassian.net/browse/KAN-209) `global-planning-entry-api-search.md` · 사람 손: **영어 검수자 배정**(게이트 2는 대본 직접 열람), 후보마다 도메인 판정 |
| 관련 | BE [KAN-190](https://runtime364.atlassian.net/browse/KAN-190) 발행 계약과 같은 필드를 기록한다 — 제품 발행은 5번 |
| 근거 문서 | **`docs/ai/global/PIPELINE.md` 6.1·6.2·6.9·7장** · `spec/api/global-api.md` 4.9(`market`·`language`·태그 `^[가-힣A-Za-z0-9 ]{2,20}$`·`target_audiences` 생략) |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 앱·서버 결정은 `spec/api/global-api.md`가, 파이프라인 결정은 `docs/ai/global/PIPELINE.md`가 원본이다. **티켓과 명세가 다르면 명세를 따른다.**

## 무엇을 한다

- **생산 입구는 주제 기획 하나다** — 사람이 주제(1~2개)·제목안·메모를 넣으면 서버 워커가 검색·후보 구성까지 한다(명세 6.1). 스윕·군집화 자동화는 글로벌판에 두지 않는다.
- **도메인 사후 판정** — 미리 채운 소스 풀이 없다. 기획 검색이 데려온 도메인이 `candidate`로 쌓이고, 게이트 1 전에 사람이 후보 단위로 판정한다(명세 6.2의 주의 영역 표 기준).
- **메타** — `enrichment.json` 영어 판정 기준, `language: "en"`, `target_audiences` 생략, 태그는 완화 규칙(공백 허용·2~20자). 워커의 `ENRICH_TAG_RE`(현행 2~10자·공백 금지)는 공유 코드라, **`en`에서만 완화하거나 서버가 4.9를 배포한 뒤 두 로케일을 함께 바꾼다** — 서버 배포 전에 한국판이 공백 태그를 보내면 400이다. 임베딩 모델 유지.
- **`upload-meta.json`**에 `market: global`·`language: en` 기록 → 콘솔이 payload로 옮긴다(BE 4.9 배포 전엔 플래그 off).
- **파일럿·생산** — **5편 단위 테스트**: 주제 기획 5건 → 단계마다 사람 확인 → 전 편 사람 판정 → 규칙 반영 → 다음 5편(명세 7장). 글로벌 오픈까지 **게이트 2 통과 최소 40편**.

## 범위 밖

시장별 권리 규칙(정규 운영) · 제품 발행(5번)

## 완료 조건

- Given 글로벌 오픈 전 / Then 게이트 2를 통과한 영어 에피소드가 40편 이상이고, 각 `upload-meta.json`에 `market=global, language=en`이 있다
- Given 5편 단위 테스트 / Then 회차마다 판정 결과와 반영한 규칙 변경이 처리 기록에 있다
- Given 생성된 태그 / Then 전부 `^[가-힣A-Za-z0-9 ]{2,20}$` 통과, `target_audiences` 없음
- Given 게이트 1을 통과한 후보 / Then 소스 도메인 중 `candidate`가 0건이다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-14 명세 우선 정리 — "글로벌 도메인 20~30곳 사전 판정"을 **후보 단위 사후 판정**으로, "스윕 자동화는 2단계"를 **스윕 없음**으로 바꿨다(명세 6.1·6.2). `upload-meta`의 `track`은 인스턴스 분리로 뺐다. 파일럿 규모는 사용자 결정(2026-10-14): **테스트는 5편 단위, 글로벌 오픈까지 최소 40편**(종전 "주제 4~5개 × 5편 = 20~25편"). 기한 10-24는 그대로 두되, 40편은 게이트 1(자동 승인 없음·도메인 판정)과 영어 검수를 매일 사람이 돌려야 맞출 수 있어 일정 위험이 있다.
- 2026-10-15 메타 동작 구현(브랜치 `feat(ai)/global-enrichment-meta`) — `PIPELINE_LOCALE=en` 에서만 갈린다. 한국판 프롬프트·스키마·정규화 결과는 바꾸기 전과 글자 단위로 같다(대조 확인).
  - 태그: `ENRICH_TAG_RE_GLOBAL` = 서버 `CONTENT_TAG_PATTERN` 과 같은 식(공백 허용 2~20자, 앞뒤 공백 없음). 안쪽 연속 공백은 하나로 접는다. 한국판 `ENRICH_TAG_RE` 는 그대로(서버 규칙이 상위 집합이라 서버 쪽 동시 변경 필요 없음).
  - `target_audiences`: en 판정 스키마·프롬프트에서 뺐고, 모델이 내도 정규화가 경고와 함께 버린다.
  - `language`: **`enrichment.json` 에 싣지 않는다**(사용자 결정 A) — global-api 4.9 상 선택이고, 서버 `enrichment-file.ts` 가 모르는 키를 파일째 거부한다. 언어는 발행 payload 로 간다. 명세 6.9 를 같이 고쳤다.
  - `upload-meta.json`: en 에서 `market: "global"` · `language: "en"` · `topics`(대표 먼저, 보조 주제는 0028 `backlog.sub_topic`)를 더한다. 메타 부여는 `topics` 를 주제명으로 쓴다. 한국판 upload-meta 는 키를 더하지 않는다.
  - 남은 것: 콘솔이 upload-meta 의 `market`·`language`·`topics` 를 발행 payload 로 옮기는 일은 발행(KAN-204, BE 계약 뒤). 영어 판정 기준(`difficulty`·`format` 등, 명세 10장 #9)과 태그 문구는 영어 규칙 설계 때.
