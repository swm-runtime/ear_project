# [AI] 글로벌 트랙 — K-컬처 주제 체계 · 영어 진행자·보이스 · 영어 생산 라인(소스 풀·L0·QA·TTS) · 파일럿 20~25편

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/supabase/schema.sql`(track 컬럼) · `pipeline/apps/worker/src/`(assets 프로파일·draft-two-stage L0·tts/normalize·stages/package) · `docs/ai/skills-en/`·`docs/ai/spec-en/`(신설) · `docs/ai/PIPELINE.md`(트랙 개념) |
| 요청 파트 | AI 파이프라인 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박수헌 |
| Jira | [KAN-184](https://runtime364.atlassian.net/browse/KAN-184) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 (Medium — 1~3일차: 결정 확정·트랙 자산·첫 3편 실측). 전체 목표 **2026-10-24까지 영어 20~25편 검수 통과**(글로벌 빌드 심사 제출과 동시) |
| 선행 | 없음(티켓). 사람 손: **영어 진행자 2인 페르소나·보이스 선정**(박수헌 제안 → PM 확정) · **영어 검수자** 배정(게이트 2는 대본 직접 열람) · 해외 매체·팬 커뮤니티 권리 판정(변호사 검토 #1 범위 확장) |
| 관련 | BE `tickets/backend/pending/global-market-model.md`(발행 계약 `market/language` — **제품 발행은 이것 뒤**, 그 전엔 미발행 패키지 검수까지) · FE `tickets/frontend/pending/global-english-ui.md` |
| 근거 문서 | 2026-10-14 글로벌화 조사(AI) · `docs/ai/PIPELINE.md` · `spec/01·03·04·05·06` · `skills/draft/guidelines.md` · `skills/critic/rubric-v2.md` |
| 중요도 | Medium — 기한은 1~3일차. 10일 계획의 **진짜 임계 경로는 콘텐츠 물량**(주제 4~5개 × 5편) |
| 상태 | 대기 |

## 결정 사항 (2026-10-14 박준현)
영어 트랙은 **번역이 아니라 영어 네이티브 생성**, 진행자는 **영어 전문 새 2인**, 주제 체계는 **해외 대상 K-컬처로 신설**(한국어 트랙 자산 불변). 소스 풀·축 규칙·검수 기준은 트랙별.

## 코딩 전 결정 (1일차, 박수헌 제안 → PM 확정)
1. 영어 진행자 2인 — 이름·배경·역할(해설/진행) · ElevenLabs 영어 보이스 2개(한국 고유명사 발음 능력 포함 청취 비교).
2. **K-컬처 주제 트리 초안** — 대분류 4~5(예: K-Pop · K-Drama/Film · K-Beauty · K-Food/Travel · Korean Language/Culture) × 중분류. 제품 `topics`와 1:1 규약 유지. 한국 특화 분류(자격증·부동산·직군)는 제외. → BE가 `topics(market=global)`에 반영.
3. 소스 풀 범위 — 해외 K-컬처 매체(Soompi류)·한국 매체 영어판(Korea Herald·Yonhap EN)·공식 보도자료 허용, 팬 커뮤니티·위키는 보조 근거로만(권리 판정 뒤). 아이돌·브랜드 실명 언급 정책.
4. 축 규칙 — K-컬처는 컴백·이슈 소재가 많아 현행 "소식 아닌 주제 축·사건 축 금지"(spec/03 2장)를 어디까지 유지할지(예: 사건을 계기로 한 주제 축은 허용).
5. 영어 분량 기준 — 한국어 13분 하한 유지 여부(wpm 150~160 기준 환산).

## 무엇을 한다

### 1~2일차 — 트랙 축 · 자산 분리 (S + M)
- `domains`·`sources`·`backlog`·`episodes`·`topics` 미러에 `track`(`ko | global`) 컬럼(마이그레이션 1건). 에피소드 ID 접두사 분리(예 `G{YYMMDD}-nnn`)로 S3 키·중복 대조가 갈린다. 콘솔에 트랙 필터.
- `ASSET_PROFILE`(`assets.ts PROFILE_KEYS`)을 "프로파일 → 키 매핑 맵"으로 일반화해 `ASSET_PROFILE=en`이 `docs/ai/skills-en/*`를 읽게 한다. `skills-en/{draft,qa,critic,tts,thumbnail}` + `spec-en/04,05,06` 초판(guidelines 영어판 — 언어 종속 규칙 19·16·24·6 제거, 영어 구어체 규칙 신설 / QA 항목 5·6·10 영어판 / rubric F군·3.8 영어판. 사실 검증 항목 1~4·8·9는 공유).
- 페르소나 추상화: `topics.explainer` CHECK(`'윤아','이음'`)·파서 `Speaker` 타입·`voiceOf()`·`settings.templates`(인트로/클로징)를 **트랙별 페르소나 설정**으로.

### 2~3일차 — L0 · TTS 영어 분기 (M)
- L0(`draft-two-stage.ts` 한국어 정규식 ~30종): 영어 트랙은 **한국어 전용 검사 전부 건너뛰고** 형식 계약·구간·분량(wpm)·턴 리듬만. 정식 영어 L0는 정규 운영에서.
- TTS: `normalize.ts`를 트랙별 구현으로(영어는 숫자·약어 처리만, **영문 잔존 검사 비활성**), 발음 사전을 "로마자 표기 → 발음 힌트" 형식(아이돌·브랜드·지명), 영어 보이스 2개 env, 배속 재측정, `package.ts` 341자/분 → wpm, 구간 요약 프롬프트 영어판.
- 첫 **3편** 생성 → QA → TTS 실측 → 분량·톤 보정.

### 3~7일차 — 소스 풀 · 생산 (운영 + S)
- 글로벌 도메인 20~30곳 사람 판정(tier·라이선스), 주제 기획 모드(B-②)로 후보 생성(스윕 자동화는 2단계). 군집화·보강 검색의 언어·`site:` 풀을 트랙별로.
- 메타: `enrichment.json` 영어 판정 기준, `target_audiences` 생략, 태그 규칙 완화(공백·20자 — BE 동시 변경), 임베딩 모델 유지.
- **주제 4~5개 × 5편 = 20~25편** 검수 통과(영어 검수자). `upload-meta.json`에 `track/language/market` 기록. 제품 발행은 BE 계약(`market/language`) 반영 뒤 개발계 → 운영.

### 8~10일차
- 비용·한도: `runs`에 트랙 축, ElevenLabs 한도 두 트랙 공용 모니터링. 영어 TTS 단가 실측(글자 수가 늘어 과금 ↑ 예상).
- 공개 후 2주 안에 30~40편으로 확장. 정규 운영 항목(영어 정식 L0·골드·회귀 세트, 축 규칙 K-컬처판, 스윕 자동화, 시장별 권리 규칙)은 후속 티켓.

## 완료 조건
- Given `ASSET_PROFILE=en` / When 워커가 자산을 읽는다 / Then `skills-en/*`만 읽고 한국어 자산·규칙은 영어 트랙에 적용되지 않는다. 한국어 트랙은 변화 없음(기존 회귀 세트 통과)
- Given 영어 대본 1편 / When L0 → QA → TTS / Then 한국어 전용 검사에 걸리지 않고 합성이 끝난다(영문 잔존 중단 0건)
- Given K-컬처 주제 트리와 소스 풀 / When 7일차 / Then 영어 20편 이상이 검수를 통과하고 `upload-meta.json`에 `track=global, language=en`이 있다
- Given BE 발행 계약 반영 / When 개발계 발행 / Then GLOBAL 사용자에게만 노출된다(BE e2e와 교차 확인)
- 결정 5건(진행자·보이스·주제 트리·소스 풀·축 규칙·분량)이 처리 기록에 적혀 있다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 2026-10-14 글로벌화 조사(AI 파이프라인) 결과와 박준현 결정 반영.
