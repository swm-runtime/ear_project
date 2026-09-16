# infra — 인프라 설계 문서 (SDD)

'이어'의 AWS 인프라 설계·현황·운영 절차. **코드(`backend/deploy/`)가 실행 수단이고, 이 문서들이 그 근거와 현황이다.**

| 문서 | 내용 | 언제 보는가 |
|---|---|---|
| [`architecture.md`](architecture.md) | 설계: 목표·제약 → 구조 → 결정과 근거 → 보안 → 비용 모델 | 왜 이렇게 생겼는지 알아야 할 때, 구조를 바꾸기 전 |
| [`inventory.md`](inventory.md) | **실제 생성된 리소스 전수 목록** (계정·ID·생성일) + 계정 이관 체크리스트 | 지금 뭐가 어디 있는지 확인할 때, **계정을 옮길 때** |
| [`runbook.md`](runbook.md) | 운영 절차: 처음부터 재구축 · 코드 배포 · 콘텐츠 관리 · 장애 대응 | 손을 움직여야 할 때 |

## 현재 상태 요약 (2026-09-15 실측)

- **가동 중**: `api.earcast.co.kr`(API EC2) · `admin.earcast.co.kr`(**AI 서버 EC2** — 파이프라인 웹 = 제품 발행 콘솔 `/publish` + 백엔드 로그 콘솔, 워커, 임베딩) · CloudFront 오디오 CDN. 발행 콘텐츠 10편, 사용자 21명. `pipeline.` 도메인은 2026-09-03 `admin.`으로 통합돼 없다.
- **환경은 한 벌뿐이고 그것이 실운영이다.** 스테이징·개발계 없음. dev 머지가 곧 실서버 배포다(아래).
- **배포는 CI**: dev 푸시 → GitHub Actions(OIDC 롤 `ear-ci-deploy`, SSH 임시 개방) → 두 EC2에 각각 `push.sh`. PR은 검증만. `main`은 백엔드·파이프라인 배포와 무관(앱 OTA 채널만). 비밀값 원천은 Secrets Manager `ear/prod/api`(배포마다 반영, 2026-09-09).
- **네트워크는 기본 VPC 하나**(172.31.0.0/16), 서브넷 4개 전부 퍼블릭, NAT·ALB·WAF 없음. 두 EC2는 같은 서브넷(2a).
- 계정: **ISB `639177726357`**(SW마에스트로 지원 조직 계정, SSO). 최초 구축된 개인 계정(574748894595)은 2026-08-31 이관 후 전소 — 이력·절차는 [`inventory.md`](inventory.md).
- 조직 SCP가 KVS를 거부해 재생 URL은 **무작위 키 직접 서명**이다([`architecture.md`](architecture.md) 3.2).
- 배포 코드: `backend/deploy/` (셋업 스크립트·compose·Caddy·관리자 콘솔). 비밀값: `backend/deploy/aws/out/`(gitignore, 로컬에만).

## 경계

- 랜딩 페이지(Vercel, `earcast.co.kr`)는 이 문서 범위 밖이다 — `tickets/backend/pending/share-universal-links-hosting.md`가 다룬다.
- 서버 애플리케이션 구조는 `backend/architecture.md`, 스키마는 `backend/domain.md`가 기준이다. 이 문서는 그 아래층(컴퓨트·스토리지·네트워크·전달)만 다룬다.
