# [INFRA] 개발계 분리와 운영 배포 흐름 전환 — dev→개발계 · main→운영계

| 항목 | 값 |
|---|---|
| 대상 | AWS(개발계 EC2·SG·롤·EIP·버킷·CloudFront·DLM·알람·ECR) · `.github/workflows/deploy-api.yml`·`deploy-pipeline.yml`·`eas-update.yml` · GitHub 브랜치 보호(`main`) · IAM 롤 `ear-ci-deploy` 신뢰 조건 · `backend/deploy/`·`docs/infra/` 문서 |
| 요청 파트 | 인프라 (담당 박준현, 2026-09-15 인수) |
| 요청자 | 박준현 |
| 발행 날짜 | 2026-09-15 |
| Jira | [KAN-62](https://runtime364.atlassian.net/browse/KAN-62) |
| 발견 시점 | 2026-09-15 인프라 인수 — 실계정 대조(PR #343). 환경이 한 벌뿐이고 그것이 실운영이라 dev 머지가 검증 없이 실사용자에게 닿는다 |
| 근거 문서 | `docs/infra/architecture.md` 6장(2026-09-15 미결) · `docs/infra/inventory.md` 1장 · 루트 `CLAUDE.md` Git 절(main = 배포 기준선) · `backend/load-test/README.md`(상한 실측) |
| 중요도 | **Low** — 이번 주 안에 착수. 지금 당장 장애는 없지만, 사용자 유입(광고) 전에 "검증된 것만 운영에" 구조가 있어야 한다 |
| 상태 | **진행 중** — 1단계 완료(2026-09-15) · 2단계 완료(2026-09-15) · 3단계 스크립트 검증 완료, 운영 크론 등록 대기 |

## 배경 · 확인된 현재 상태 (2026-09-15 실측)

- 서버 2대(API `i-04f1f70f5484ffafd` · AI `i-0c414b676584733da`)가 이미 같은 기본 VPC·같은 서브넷(2a)에 있다. **"VPC 통합" 과제는 필요 없다.**
- 환경이 한 벌뿐이고 그것이 실운영(`api.earcast.co.kr`, 사용자 21명·콘텐츠 10편). **dev 머지가 곧 실서버 배포**다(`deploy-api.yml`).
- `main`은 앱 OTA production 채널 외에 역할이 없고 dev보다 70커밋 뒤. 브랜치 보호 없음.
- CI 롤 `ear-ci-deploy`의 OIDC 신뢰 조건은 `refs/heads/dev`만.
- 부하 테스트(2026-09-11) 상한 초당 130~150요청, 병목은 API 프로세스 CPU. NAT·ALB·WAF·RDS 없음.

## 결정 (2026-09-15)

1. **지금 서버 = 운영계 확정.** 개발계를 새로 만든다(운영을 옮기지 않음 — 데이터·EIP·DNS·서명 키가 묶여 있어 이동량이 가장 적다).
2. **VPC 하나 유지.** 개발계는 같은 VPC에 EC2 1대(`ear-dev`, 운영과 같은 compose), 별도 SG·롤·EIP·Secrets Manager `ear/dev/api`·도메인 `api-dev.earcast.co.kr`. 운영 인스턴스 이미지를 뜨지 않는다(실사용자 데이터·운영 비밀값이 따라온다) — 셋업 스크립트로 새로 만든다. **관리자 콘솔은 개발계에 두지 않는다**(정정 2026-09-15 — 콘솔은 2026-09-03부터 AI 서버의 파이프라인 웹 `admin.earcast.co.kr`이고 그 서버는 운영 하나. 개발계 도메인은 `api-dev` 하나).
3. **AI 서버는 운영 1대만.** 개발계 API가 임베딩이 필요하면 운영 AI 서버 8000을 개발 SG에도 개방.
4. **WAF 제외.** 앞단(CloudFront/ALB)이 없어 공사가 크고 레이트 리밋으로 충분. CloudFront 앞단 설계는 후속 문서로만.
5. **release 브랜치 없음. `main` = 운영 배포 + 버전 태그.** 흐름: 작업 → dev(개발계 자동 배포) → main(운영 자동 배포 + `vX.Y.Z` 태그).
6. **운영 배포는 자동.** main 머지 조건 = dev에서만(원본 검사 워크플로를 필수 체크로) · 검증 통과 · **리뷰 1명 승인**. 별도 수동 승인 게이트 없음.
7. **콘텐츠 계층은 운영과 동일.** 개발계 DB는 별도이되 `topics·contents·content_topics·content_sources·content_embeddings·content_stats`만 운영→개발 한 방향 복사(id 유지, 매일 새벽 + 수동). 이중 쓰기(운영·개발 동시 발행) 안 함.
   - **복사 경로(확정 2026-09-15)**: 운영 서버 크론 `deploy/sync-content-export.sh`(04:10 KST)가 6개 표를 `--data-only --column-inserts`로 덤프해 백업 버킷 `content-sync/content-latest.sql.gz`에 올린다(사용자 표가 섞이면 스스로 중단). 개발계 크론 `deploy/sync-content-import.sh`(04:30 KST)가 받아 stage 스키마에 적재 후 public으로 **upsert**(삭제 없음 — 개발계 사용자 데이터가 콘텐츠를 참조하므로). 개발계는 운영 DB·서버에 접근하지 않고, 개발계 롤은 그 접두사 `s3:GetObject`만 갖는다. 로컬 검증: 196행 upsert, 2회 실행 멱등.
   - **오디오·CloudFront(정정 2026-09-15)**: 개발계 버킷·개발계 CloudFront를 **만들지 않는다**. 운영 S3·운영 CloudFront를 읽기 전용으로 공유하고, 운영 키 그룹 `ear-audio-keygroup`에 **개발계 전용 공개키 `K3CJ80YUPY9I0V`(ear-audio-key-dev)** 를 추가해 개발계는 자기 개인키(Secrets Manager `ear/dev/api`)로 서명한다. 개발계 롤에 오디오 버킷 쓰기·삭제 권한 없음 → 개발계 업로드·회수는 S3에서 거부(의도). 회수는 키 그룹에서 개발 키만 제거. 검증: 개발 키 서명 URL 206, 무서명 403. 백업 버킷도 만들지 않는다(개발계 DB는 잃어도 되는 데이터).
8. **사용자 데이터는 복사하지 않는다.** 개발계에서 자체 생성. 가명화 복사는 협업 필터링 검증 등 필요해질 때 추가.
9. **이미지는 CI가 빌드해 ECR에 올리고 서버는 pull만.** 태그 = 커밋 SHA. 개발계에서 검증된 같은 이미지가 운영으로. 배포 중 운영 CPU 경합 제거.
10. **알람 3종**: CloudWatch Logs `/ear/api` 지표 필터 5xx·ERROR 급증 · `/health` 외부 모니터 · 백업 24시간 미실행. 기존 SNS `ear-prod-alerts`.
11. **EBS 일일 스냅샷**(DLM): 두 EC2(개발계 포함) 루트 볼륨 매일 04:30 KST, 7일 보존 후 자동 삭제. 대당 월 500~700원.

## 요청 내용 (착수 순서 — 한 단계씩, 앞 단계 완료 후 다음)

1. ✅ 개발계 EC2(`setup-dev-server.sh`) — `i-0a22112e947856a71` · EIP `54.116.155.248` · SG `sg-0f8f793be74bd58e4` · 롤 `ear-dev-ec2` · 시크릿 `ear/dev/api` · `https://api-dev.earcast.co.kr/api/v1/health` 200 (2026-09-15). 첫 부트에서 셸 변수 `NAME` 충돌로 이름이 잘못 붙어 재생성한 기록은 PR #353
2. ✅ 오디오 서명 키(`setup-dev-cdn-key.sh`) — 운영 CloudFront 키 그룹에 개발 키 추가, 개발계 env `AUDIO_DELIVERY=cloudfront` 전환·재배포 (2026-09-15). 버킷·배포 신설은 하지 않음(결정 7 정정)
3. 콘텐츠 동기화(`sync-content-export.sh` 운영 크론 · `sync-content-import.sh` 개발계 크론) — 스크립트 로컬 검증 완료(2026-09-15), **운영 크론 등록·첫 동기화 대기**
4. CI 이미지 빌드 → ECR → 서버 pull 전환(운영·개발 공통 `push.sh` 개정)
5. DLM 스냅샷 정책 · 알람 3종
6. 워크플로 환경 매트릭스(브랜치 → 호스트·SG·SSH 시크릿·Secrets 경로·헬스 URL, GitHub Environments) · IAM `ear-ci-deploy` 신뢰 조건에 `refs/heads/main` 추가 · `eas-update.yml` 채널별 API 주소 분리
7. `main` 브랜치 보호(검증·"원본 dev" 체크·리뷰 1·관리자 포함·force push 금지)
8. **전환**: main을 dev와 동기화(dev→main PR) → 운영 배포 스위치를 main으로. 예고 후 머지 없는 시간에 6~8을 붙여서. 전환 절차·롤백을 `runbook.md`에 기록
9. `docs/infra/architecture.md`·`inventory.md`·`runbook.md` 개정(개발계·배포 흐름·알람·스냅샷)

전환 이후 팀에 공유할 것: dev 머지는 개발계에만 반영 · 운영 반영은 dev→main PR(리뷰 1명) · 앱 테스트는 preview 빌드(TestFlight 내부/Play 내부 트랙)를 설치해 두면 dev 머지 시 개발계 API를 보는 OTA가 자동 반영, 스토어 앱은 main 머지 시 운영 API로 OTA · 네이티브 변경은 OTA 불가(빌드 재배포).

**미결(그 단계에서 결정)**: 앱 preview 빌드의 번들 ID 분리 여부·배포 시점(FE 담당과) · 파이프라인·AI 서버 배포 트리거를 dev에 남길지(AI 파트와) · SSO 역할의 SSM 권한(후보 SSM 도입 시).

## 후속 후보 (이 티켓 범위 밖)

- SSM Session Manager로 SG 22번 폐쇄(공존 후 전환) · Dependabot·시크릿 스캐닝 · API 프로세스 2~4개 + Redis(동시 100명 근처) · Route 53 이관.
- 트래픽 스파이크 대비: 캠페인 D-1 t4g.large 상향 + API 컨테이너 3~4 복제(상한 ~500~600 req/s), 사용자 무관 응답 캐시, 05시 푸시 분산. ALB·RDS는 동시 수천 명 규모부터(ALB는 DB 분리와 세트).

## 완료 조건

- Given 개발계 EC2·DNS가 있다 / When dev에 백엔드 변경이 머지된다 / Then `api-dev.earcast.co.kr/api/v1/health`가 새 커밋으로 200을 주고 **운영(`api.earcast.co.kr`)은 바뀌지 않는다**
- Given dev→main PR / When 리뷰 1명 승인 + 검증 통과 전에 머지를 시도한다 / Then GitHub가 머지를 막는다. dev가 아닌 브랜치에서 main으로 PR을 열면 "원본 dev" 체크가 실패한다
- Given main에 머지된다 / When 배포 워크플로가 끝난다 / Then 운영 헬스가 200이고 커밋에 `vX.Y.Z` 태그가 붙는다. 배포된 이미지 태그(커밋 SHA)가 개발계에서 검증된 것과 같다
- Given 운영에 콘텐츠가 발행된다 / When 동기화가 돈다(새벽 또는 수동) / Then 개발계 콘텐츠 목록에 같은 id로 나타나고 개발계 앱에서 재생된다. 운영 `users` 행은 개발계에 없다
- Given API가 5xx를 1분에 N건 이상 내거나 `/health`가 실패하거나 백업이 24시간 안 돌았다 / When 알람 조건이 충족된다 / Then `ear-prod-alerts` 메일이 온다
- Given DLM 정책이 있다 / When 하루가 지난다 / Then 각 EC2 루트 볼륨 스냅샷이 1개 늘고, 8일째 것은 지워져 있다
- Given 전환 당일 / When 6~8단계를 수행한다 / Then 운영 API 다운타임 없이(헬스 연속 200) 배포 대상이 바뀌고, 절차·롤백이 `runbook.md`에 있다
