# [AI] 글로벌 6 — 글로벌 인스턴스 인프라: Supabase 프로젝트·S3 버킷·스키마·주제 시딩·글로벌 콘솔·서버 워커

| 항목 | 값 |
|---|---|
| 대상 | 두 번째 Supabase 프로젝트(`schema.sql` + 마이그레이션 전부) · 글로벌 S3 버킷·버킷 정책 · `topics` 8개 시딩 · `settings`(자동 승인 끔·발행 준비 연쇄 끔·템플릿) · 글로벌 콘솔 배포(서브도메인) · 서버 워커 두 번째 프로세스(`PIPELINE_LOCALE=en` · `CAPABILITIES=ai,io` · OpenAI 실행기) |
| 요청 파트 | AI 파이프라인 |
| 요청자 | 박수헌 |
| 담당 | 박수헌 |
| 발행 날짜 | 2026-10-14 |
| Jira | [KAN-208](https://runtime364.atlassian.net/browse/KAN-208) |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 (Medium) |
| 선행 | 없음. 사람 손: Supabase 프로젝트 생성·서버 env·DNS·GCP 원본 등록은 사용자가 직접 실행. (Free 플랜 여유·서버 메모리 확인은 2026-10-14 완료) |
| 관련 | [KAN-201](https://runtime364.atlassian.net/browse/KAN-201) `PIPELINE_LOCALE` 분기 — 워커는 분기가 들어간 코드로 띄운다 · [KAN-202](https://runtime364.atlassian.net/browse/KAN-202) 생산이 이 티켓에 막힌다 · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 근거 문서 | **`docs/ai/global/PIPELINE.md` 4.1·4.4·8장·9장 G1** |
| 심각도 | 중 |
| 중요도 | Medium |
| 상태 | 완료 (2026-10-15) |

## 문제

글로벌판은 한국판과 **코드는 공유하고 인스턴스는 분리**한다(명세 4.2). 한국판 DB·버킷·자산에 글로벌 행을 넣지 않으므로, 글로벌 인스턴스가 쓸 DB·버킷·콘솔·워커가 따로 있어야 한다. 묶음 티켓을 나눌 때 이 작업이 어느 티켓에도 들어가지 않았다.

## 요청 내용

1. **DB** — 별도 Supabase 프로젝트(Free 플랜 두 번째 무료 프로젝트)에 한국판과 같은 스키마(`schema.sql` + 마이그레이션 전부)를 적용한다.
2. **저장소** — 별도 S3 버킷. 한국판과 같은 계정·자격증명 모델(EC2 인스턴스 역할 · 웹 서명 URL), 버킷 정책만 추가한다.
3. **시딩** — `topics` 8개(명세 2장 — 이름·slug), `settings.automation.auto_approve` 끔, 비평 뒤 발행 준비 연쇄 끔(명세 7장 파일럿).
4. **글로벌 콘솔** — 주소 **`admin-global.earcast.co.kr`**(2026-10-14 확정). 한국판과 같은 EC2에 둔다(2026-10-14 실측).
   - DNS: `admin-global` A 레코드를 AI 서버 고정 IP로 추가(사용자 실행)
   - 코드: Caddyfile에 글로벌 사이트 블록, compose에 글로벌 콘솔·워커 서비스, 서버에 글로벌 env 파일
   - GCP: 구글 로그인 "승인된 JavaScript 원본"에 `https://admin-global.earcast.co.kr` 등록
   - env: 알림 링크 기본 URL은 새 주소, 발행 SSO 키는 한국판과 같은 값(발행처가 같은 제품 서버)
   - 화면 상단에 `GLOBAL` 표시(분기는 KAN-201)
5. **서버 워커** — 글로벌 인스턴스 env로 두 번째 워커 프로세스를 띄운다(`PIPELINE_LOCALE=en` · `CAPABILITIES=ai,io` · OpenAI 실행기). 한 워커는 한 인스턴스만 본다. 노트북 워커는 두지 않는다(명세 4.4).
6. 알림 — Slack `#dev-ai` 공유, 큐 비움 요약 머리에 `[GLOBAL]`.

## 완료 조건

- Given `https://admin-global.earcast.co.kr` / When 구글 로그인한다 / Then 한국판과 다른 DB의 빈 백로그와 주제 8개가 보이고, 상단에 `GLOBAL` 표시가 있다
- Given 글로벌 서버 워커 기동 / When 저장소 접근 확인이 돈다 / Then 글로벌 버킷 읽기·쓰기가 통과하고 한국판 버킷에는 쓰지 않는다
- Given 글로벌 `settings` / Then 자동 승인과 발행 준비 연쇄가 꺼져 있다
- Given 한국판 콘솔·워커 / Then 글로벌 인스턴스를 띄운 뒤에도 동작이 같다

## 처리 기록
- 2026-10-14 발행 — 묶음 티켓 분할(KAN-200~204)에서 빠진 명세 G1 작업을 따로 뗐다.
- 2026-10-14 콘솔 주소 확정: `admin-global.earcast.co.kr`(하위 도메인 방식, 경로 방식은 쓰지 않음).
- 2026-10-14 사람 손 확인 완료: Supabase Free 플랜 활성 프로젝트는 한국판 하나뿐 → 두 번째 무료 프로젝트 가능(한도 2, 비용 0). AI 서버(t4g.small) 실측 — 메모리 1.8GiB 중 가용 1.2GiB, 컨테이너 합계 약 200MiB, 스왑 2GiB, 디스크 12G 여유 → 같은 EC2에 둔다. 두 워커의 오디오 작업이 겹칠 때의 순간 메모리는 파일럿 중 지켜본다.
- 2026-10-14 DB 구축: 글로벌 Supabase(서울, Free 두 번째 프로젝트)에 `schema.sql` 기본부 → 마이그레이션 0002~0027 적용(0002·0011 한국판 데이터 백필 제외), 자동 승인·발행 준비 연쇄 끔. 한국판과 구조 대조 — 테이블 10·컬럼 137·제약 31·트리거 7·정책 22·뷰 1·인덱스 20 동일(차이는 자동 RLS 함수 하나). 대조에서 나온 2건(`publish_log.actor` 기본값, 0018 옛 `claim_job`)은 글로벌 DB에서 맞추고, 새로 구축해도 같아지게 0014·0025 마이그레이션에 멱등 문장을 더했다(한국판 무영향).
- 2026-10-14 서버 구성 코드(브랜치 `feat(ai)/global-instance-infra`): compose `web-global`·`worker-global`(profile `global` — 서버 `deploy/env.global` 이 비어 있지 않을 때만 push.sh 가 띄움) · Caddy `admin-global` 사이트 블록 · push.sh 가 env.global 보호 · 콘솔 Supabase 접속값을 실행 시점 env(`SUPABASE_URL`·`SUPABASE_ANON_KEY`)로 — 이미지 하나를 두 인스턴스가 쓴다(한국판은 env 가 없어 빌드 값 그대로) · 글로벌 워커는 백엔드 로그 감시를 돌지 않고 알림에 `[GLOBAL]` · `env.global.example` · deploy README 9장.
- 2026-10-14 버킷 `earcast-pipeline-global` 생성(비공개·버저닝·SSE·TLS 강제), 정책 `ear-pipeline-global-bucket-rw` 을 `ear-ai-ec2` 에 부착. `docs/infra/inventory.md` 등재.
- 남은 사람 손: 가비아 A 레코드 `admin-global` → 54.116.31.183 · 머지 뒤 `make-env-global.mts` → `upload-env-global.sh` · GCP 승인된 JavaScript 원본에 `https://admin-global.earcast.co.kr`(발행 화면 구글 로그인) · 팀원 초대(콘솔이 뜬 뒤). 진행자 이름은 임시 `HostA,HostB` — 페르소나 확정 후 교체.
- 2026-10-15 글로벌 인스턴스 기동: DNS(`admin-global` → 54.116.31.183) 확인 → #1529 머지 → 배포가 `push.sh` 의 `$PROFILE` 로컬 확장(`set -u`)으로 rsync 직후 실패(컨테이너는 이전 이미지 그대로, 한국판 정상) → 핫픽스 #1570(`\$PROFILE`) → 재배포 성공. env.global 업로드(사람), 한국판·글로벌판 최신 이미지 재기동, Caddy 재생성. 글로벌 콘솔 응답 307, 로그인 화면이 글로벌 Supabase 에 연결(한국판과 다른 프로젝트) 확인. 글로벌 워커 기동 로그 `locale=en` · `s3://earcast-pipeline-global`.
  - **정정**: 위 "GCP 승인된 JavaScript 원본" 단계는 필요 없다 — 콘솔 로그인은 Supabase 이메일(비밀번호·로그인 링크)이고 발행은 SSO 교환이라 구글 OAuth 를 쓰지 않는다. 대신 글로벌 Supabase 에서 팀원 추가(Authentication → Users), 로그인 링크용 URL Configuration(Site URL·Redirect URLs 에 admin-global), "Allow new users to sign up" 꺼짐을 확인한다.
  - 콘솔 구분(박수헌): 좌상단 GLOBAL 표시 제거, 글로벌판은 사이드바 색(짙은 자주)으로만. 백엔드 로그·추천 검증은 두 시장이 같이 쓰는 제품 서버 화면이라 글로벌 콘솔의 콘솔 전환에서 뺐다. 제품 발행 목록은 인스턴스 시장으로 거른다(`market=global`·`market=kr`, admin-api 4.5).
- 2026-10-15 OpenAI 키 분리(박수헌): 글로벌 콘솔·워커는 글로벌 전용 OpenAI 프로젝트 키를 `env.global` 에서 받는다(compose `environment` 의 한국판 키 덮어쓰기 제거). 이유: 프로젝트별 예산 한도·사용량 분리, 한쪽 키 문제의 영향 차단. ElevenLabs 는 계정 한도가 묶여 키 분리로 나뉘지 않아 그대로 공유(TTS 시작 때 다시 본다). 순서: 키 발급 → 로컬 global.env `GLOBAL_OPENAI_API_KEY` → make-env-global → upload-env-global(사람) → 머지·배포.
- **2026-10-15 완료 — 반영 날짜 2026-10-15** (PR #1529·#1570·#1574·#1596). 완료 조건 판정:
  - ① 글로벌 콘솔 로그인 → 한국판과 다른 DB·주제 8개: 충족. 조건 문구의 "구글 로그인"·"상단 GLOBAL 표시"는 이후 결정으로 바뀌었다 — 로그인은 Supabase 이메일(구글 OAuth 미사용), 구분은 사이드바 색(박수헌 2026-10-15).
  - ② 글로벌 버킷 읽기·쓰기, 한국판 버킷 미사용: 충족 — 워커 기동 로그 `storage=direct s3://earcast-pipeline-global`, 기획 결과 파일이 글로벌 버킷에 있다.
  - ③ 자동 승인·발행 준비 연쇄 꺼짐: 충족 — 글로벌 `settings.automation` `{"auto_approve":false,"auto_publish_prep":false}` 확인.
  - ④ 한국판 동작 무변화: 충족 — 배포 뒤 한국판 콘솔 정상(307), 머지 배포의 규칙 자산 활성화가 13개 전부 "git 사본과 동일".
  - 남은 사람 손 없음. 팀원 추가는 글로벌 Supabase Authentication → Users 에서 필요할 때.
