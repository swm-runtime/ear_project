# 파이프라인 작업 현황 · 파일 구조

> 갱신: 2026-09-01 · **운영 DB 가동 중** — Supabase `akckswokvlosgmzawjuq` (서울 ap-northeast-2)
> 테이블: domains(49) · sources(726) · backlog(14) · runs(7+) · topics(10) — 로컬 파일에서 이관 완료 (2026-08-23)
> **품질 사이클 진행 중** (spec/09): 프롬프트 full-v3 (2026-08-28, 스타일 디렉션 D1~D8 전체 승인) ·
> 비평가 선행 검수 도입 (critic-v1 루브릭, runs phase='critic' 추가) · C05 v3 재생성 — v2 통제 비교·판정 대기
> **QA 첫 실전 완주** (2026-08-28): C05 v3 — attempt 1·2 실패(환각 6건+정합 깨짐 검출) → 수정 → attempt 3 **qa_passed**.
> 검출률 프로브 8/8(100%)·오탐 0. QA 프롬프트 qa-v1.1 (skills/qa/prompt.md). C05 상태 drafted→qa_passed
> **사이클 2회차 종결** (2026-08-28): 비평 판정 → guidelines **full-v4**(R1~R5) + 루브릭 **critic-v1.1**(F군 한국어
> 자연스러움 신설) → **v3.1** 수정·재QA 통과 → **첫 본편 골드 등록**(gold-T260820-002-full). 콜드오픈은 오디오
> 파일럿 청취 후 확정으로 유보(미결 #9). 소스 풀 2차 시딩: 비-IT 25곳(RSS 검증 17) 등록, **domains 73곳** — 판정 대기
> **사이클 3회차 제작 완주** (2026-08-28): full-v5(주제 축 규칙 13-1) + 시드2 스윕 330건 → 후보 8건(C14~C21) →
> 게이트1 승인 C15·C18 → **첫 윤아 해설 에피소드 2편** T260828-001(갈등 대화, 7.5분)·T260828-002(즉석 지식, 9.1분)
> — 둘 다 QA attempt 2에서 **qa_passed**. 비평(critic-v1.2): 역할 역전 성공·C5 주제 축 모범 판정, 사람 판정 대기.
> 공통 한계: 분량 미달 (소스 3~4건 한계 — 다음 군집부터 5건+ 또는 모드 B-① 보강 필요)
> **사이클 3회차 판정 완료** (2026-08-28): 두 에피소드 v5.1 판정 반영·재QA 통과 (T260828-001은 attempt 3,
> -002도 attempt 3에서 최종 확정). 001 → **첫 윤아 해설 골드 등록, 예시 세트 3종 만석**. 002 → 인문·교양 예비 골드 후보.
> 비평가 캘리브레이션 누적: 001 정밀도 8/9 · 002 정밀도 10/10, 검출 누락 2건(에피소드 간 비유 중복·리액션 개시 틱 → 루브릭 v1.3 후보).
> 프로세스 발견: 비평·QA 병행 시 스냅샷 불일치(002 플래그 9) → 검수 순서 규정 필요. spec/06에 콜드오픈 오디오 편집 규칙 추가.
> **full-v6 통합 개정안 승인 대기** (병합 7건 + 골드 사용법 규칙 + spec/09 스냅샷·컨텍스트 예산 + 루브릭 v1.3 — 규칙 총량 20 유지)
> **시드3 — 역사·인문 축** (2026-08-29): 신규 15곳 발굴 (RSS 확인 7 · 국문 공공 모드B 4 · 차단 신호 4) → domains 88곳.
> 스윕 395건 (JSTOR Daily·World History Enc·History Workshop·Public Medievalist·Antigone·Engelsberg·British Museum) →
> **후보 5건 C22~C26** (전부 윤아 해설·인문·교양, **군집당 소스 5건+ 표준 첫 적용** — 분량 미달 대응). 게이트1 대기.
> 주의: worldhistory.org CC BY-NC-SA의 NC 조항 판정 선행(C22) · C26 도메인 편중(Engelsberg 4/5) · C19 보강 재료 3건 발견
> **사이클 4회차 제작 완주** (2026-08-29): 게이트1 승인 C23·C24·C25·C26 → 병렬 초안(독립 서브에이전트 4) →
> QA 전 편 통과 (001 1차·002 2차·003 2차·004 3차) → 비평 4건 (QA 통과본 기준 — **검수 순서 규정 첫 적용, 스냅샷 어긋남 0**).
> **분량 문제 해결 실증**: 소스 5~6건 표준으로 4편 전부 15분대 (5,418~5,536자, 이전 7.8~9.5분 대비).
> 신규 발견: ① **spec/05 항목 6 "영문 표기" 문구가 표기 이원화와 충돌** (독립 QA 2회 동일 지적) → 문구 정정 v6 묶음에 추가
> ② **골드 표면 복제가 금지 지시에도 4편 중 3편 검출** (도입 골격·확인구·역질문 답변 문구) — 견본 중복 우려 실증, F5 확장 검출망 작동
> ③ **후반부 리듬 균질화 4편 전부 지적** — full-v5 구조적 약점, v6 후보 ④ 영국박물관 개별 페이지 403 (피드는 정상) — 판정 시 hold 검토
> 비평 판정(사람) 대기 4건 · 도입 분산 지정 결과: 3편 탈템플릿 성공, 1편(001) 골드 골격 복제
> **웹 UI·워커 착수 — M1 진행** (2026-08-29, spec/10): 결정 = EC2 1대 web+worker · 모노레포 · **AI 실행은 로컬 워커(팀원 구독, `claude -p`)** ·
> API 키 미사용 · TTS 수동 전용. git init + npm workspaces (apps/worker · packages/pipeline). 스키마 0002: `jobs` 큐·`episodes` 인덱스(8편 백필)·`claim_job`.
> 워커 검증: sweep(심리학 5/5 피드 170건) → cluster 자동 연쇄 → **후보 6건 C27~C32 (전부 소스 6~7)** — 8분, 구독 실행(정가 환산 $4.1).
> 결함 수정: 군집 중복 대조를 전 중분류로 확장(C32↔C26 겹침 발견). 시드 파일 3종 → archive/ (DB 백필 완료). **다음: 게이트1 승인 → draft→qa→critic 연쇄 검증 (M1 완료 조건)**
> **M1 완료 — 워커 연쇄 검증 통과** (2026-08-31): C29 승인 → 워커 감지 → **T260831-001** (75턴·5,707자) → QA a1 실패(1) → 최소 수정 → QA a2 실패(새 지적 1) → 수정 → **QA a3 통과** → 비평(4·3·4·4·4, 위반 8·의심 7·⭐7) — 사람 개입 0, 전 단계 runs 기록(executed_by=worker).
> 장애 1건: 워커 프로세스 사망(원인 미확정 — pg 풀 'error' 미처리 유력) → 고아 `claude -p`가 산출물을 완성 → **재집기 복구 경로 신설**(작업에 episode_id 고정 + 산출물 존재 시 이어받기 + 작성 중이면 RetryLater) + 풀 오류·SIGHUP·예외 처리 보강. macOS Desktop 권한(TCC) 이슈 1회 — 재허용으로 해결.
> 비평 소견: 골드 관용구 복제(마무리 큐·"좀 억울한데요")·중반 리듬 균질화·"그 번역이 정확해요" 규칙 용어 누출 — 사이클 4와 동일 패턴 (v6 개정 근거 강화). 사람 판정 대기.
> **M2 웹 UI 골격 완료** (2026-08-31): Next.js 16 (apps/web) — 로그인(Supabase Auth)·대시보드(워커 온라인·작업·runs)·백로그 보드(게이트1 버튼)·에피소드(대본 뷰어·발췌/claims/QA/비평 탭·**비평 판정 폼**·TTS 수동 버튼)·
> 소스 풀(계층 판정 시트)·스윕 요청·주제 CRUD·설정(TTS 보이스). 스키마 0003: 팀 RLS + 승인자/판정자/요청자 **DB 트리거 스탬프** + settings. `next build` 통과. **실행 대기: Supabase anon 키 + Email Auth 활성 + 팀원 초대**
> 접속: Project URL + secret key (팀 공유), DB 직접 접속은 pooler `aws-0-ap-northeast-2.pooler.supabase.com:5432`
> 스키마 원본: [pipeline/supabase/schema.sql](../../pipeline/supabase/schema.sql) — 변경 시 이 파일 기준으로 관리
> ⚠️ 이 아래 파일 구조는 이관 전 로컬 기록이다. 이후의 상태 원본은 DB, 산출물의 원본은 파이프라인 S3(spec/10 3.3 — 로컬 폴더는 `storage:migrate` 로 올린 뒤 캐시)

> **평가 체계 v2 전환** (2026-09-01): 멘토링(08-31) + 논문 5편 대조 → **spec/09 v2**(하한/상한 분리 · L0~L3 4층 · 회귀 세트 · κ 승격 조건 · 연동 갱신 절차) ·
> **critic-v2 초안**(100점 12항목 · 판단 플래그 20 · 앵커 32자리 비움) · qa-v1.2(항목 5 판정 활성, 고지 제외) · critic-v1.3(C2·C4 동기화) ·
> 골드 2종 [도입] 제거(구 규칙 13 판 → archive/) · INTRO_STYLES v5.1 · 대본 8편 형식 통일(`[화자] E1 · 본문`, 백업 archive/script-format-backup/) ·
> **비평 모델 Opus 고정**(CRITIC_MODEL) — Fable 기준선 9편은 `critic-report-v2-fable.md` 보존, Opus 재채점 9건 진행 · **사람 판정 0/9 (앵커 원료)** ·
> 웹: 대본 탭 판정 뷰(턴 클릭 판정·점수표·직접 수정) · 소스 풀 확인 항목 ①~④ 자동 수집(domain_check, 88곳, 기계 제안 1군 40/보류 25/차단 16/2군 4 — 판정은 사람) ·
> 08-28 파일 판정(T260820-002) DB 이관 · **S3 버킷 준비됨 → M4 착수 대기** · 루트 README 신설(팀 공유 준비) · 미결 #15 → spec/09 흡수, #16~#19 신설

> **팀 레포 반입** (2026-09-01): 독립 저장소 대신 `ear_project` 로 — 코드 `pipeline/`(web·worker·packages·supabase), 명세·프롬프트 자산 `docs/ai/`(단일 원본 = 워커의 ASSET_ROOT). 산출물 `episodes/`·`sources/sweeps/` 는 WORK_ROOT(레포 밖)에 두고 M4 에서 S3 로. `ai-server/` 와의 역할 경계는 spec/10 2장 정렬. 상세 spec/10 6장

> **계획 확정** (2026-09-01): 저장 배치 기준(spec/08 1장) · 파이프라인 전용 버킷 규격·자격증명 모델(spec/08 2장, `pipeline/deploy/aws/`) · 규칙 동기화 하이브리드(`prompt_assets` — spec/10 3.2) · 실행기 전환 계획 구독 → API(A안 확정) → 파인튜닝 로컬(spec/08 3.1·5장) · AI 서버 = 기존 VPC EC2 1대, NAT·ALB·Fargate 없음(spec/10 2장·M6) · 마일스톤 순서 **M-R → M4 → M6 → M5**. 미결 #11·#12 갱신, #21·#22 신설

> **M-R 규칙 동기화 구현** (2026-09-01): 0009(`prompt_assets`·`episodes.asset_versions`·`runs` 계측) · 워커 로더(DB 7 + git spec 3 → `WORK_ROOT/assets/<해시>/`, 에피소드 단위 버전 고정, `prompt_version` 자동 유도, 폴백 없음) · 웹 `/assets`(목록·편집·draft·diff·활성화·이력, 비평 화면 "규칙으로 승격") · `assets:import/export/status` · `pickupApproved` 선점 수정. 0009 적용·시딩 완료(2026-09-01 14:45 KST, 자산 7개 active)
> **M5 TTS·패키지 구현** (2026-09-02): eleven_v3 다중화자 1콜 · 보이스 확정(윤아=Annie, 이음=Yohan Koo — 미결 #8 해소) · 음차/숫자 정규화기(표준 사전 = `apps/worker/src/tts/normalize.ts`) · 콜드오픈 = 원본 턴 with-timestamps 합성 후 절단(재합성 금지 준수) · loudnorm → master.wav+dist.mp3 → S3 `audio/` · package(upload-meta.json·packaged) · 웹 오디오 탭·패키지 버튼 · `sample_turns` 샘플 합성. OpenAI(임베딩)·ElevenLabs 키는 서버 env 연결·실호출 검증 완료\n> **M6 AI 서버 EC2 리소스 생성** (2026-09-02): t4g.small `i-0c414b676584733da` · EIP `54.116.31.183` · SG/역할 `ear-ai-ec2`(버킷 정책만) — 전부 신규, 기존 무변경(스냅샷 diff). compose 4컨테이너·push.sh(rsync — 조직이 deploy key 금지)·README 는 `pipeline/deploy/`. 남은 것: env 비밀 → 기동 → 가비아 A 레코드 → Supabase Auth URL
> **M4 S3 산출물 동기화 구현** (2026-09-02): 버킷 `earcast-pipeline-prod`(2026-09-01 생성) · 워커 `storage.ts`(단계 전 pull·후 push, md5↔ETag 멱등, direct/web 두 백엔드, 기동 시 접근 점검) · 웹 `s3:` 읽기·턴 수정 PutObject · `POST /api/storage`(로컬 워커용 서명 URL, 공유 토큰) · `storage:status`/`storage:migrate`. 검증: 실버킷 왕복(direct·web 모두)·라우트 401/405/400·서명 PUT 업로드. **이관 완료**(2026-09-02): 10편 86파일 1.9MB 업로드, `episodes` 키 48개·`runs` 74건 `s3:` 치환. 남긴 것: `backlog/*.md`·시드 기록 5건(로컬 전용)

## 디렉토리 구조

```
sources/                          ← 소스 풀 · 스윕 (02 문서)
  domains-seed.md                   원천 사이트 50곳 시드 목록 — 계층은 '제안', 사람 판정 대기
  sweeps/
    sweep-2026-08-20.json           수집 원본 727건 (링크+메타데이터만, 원문 미저장)
    sweep-2026-08-20.md             열람용 목록

backlog/                          ← 에피소드 후보 (03 문서 3장 형식)
  backlog-2026-08-20.md             군집화 후보 13건 + 보류 1건, 상태 관리 포함

episodes/                         ← 제작 산출물 (후보별 1폴더)
  T260820-001 (백로그 C04)/
    sources.md                      소스 발췌 (내부 증적, 재배포 금지)
    script.md                       대본 (숏폼 1분~1분 30초)
    claims.md                       주장→소스 근거 대조표 (QA 입력)
  T260820-002 (백로그 C05)/
    sources.md · script.md · claims.md
```

## 상태 요약

| 항목 | 상태 |
|---|---|
| 소스 풀 | 시드 50곳 수집 확인(45곳 OK) — **계층 판정(사람) 미완** |
| 백로그 | 13건 proposed 중 C04·C05 승인(2026-08-20) → **drafted** |
| C04 (AI 에이전트 침입) | **대본 v2 (2인 대화체, 07 문서 규격)** · v1(1인)은 script-v1-solo.md 보존 · QA 미실행 |
| C05 (공급망 공격) | **대본 v2 (2인 대화체)** · v1의 시점 고정 표현("오늘 아침") 제거됨 · QA 미실행 |
| 포맷 명세 | 07-format-persona.md 확정 (2026-08-20) — 화자: 윤아·이음, 대화체 규격·QA 추가 항목 정의 |

## 다음 할 일

1. 대본 2건 검토 (게이트 2 이전의 초안 확인) — 대본 가이드라인 피드백 반영
2. QA 독립 실행 (03 문서 4장: 별도 컨텍스트에서 소스 발췌·대본·claims만으로 7항목 검사)
3. `domains-seed.md` 계층 판정 — 편입 워크플로(02 문서 3장)
4. 나머지 proposed 11건 승인/반려 판단
