# 리소스 인벤토리 — 실체 목록과 계정 이관

| 항목 | 값 |
|---|---|
| 작성 | 2026-08-31 |
| **AWS 계정** | `574748894595` — ⚠️ **팀이 쓰려던 계정이 아닐 수 있음** (2026-08-31 인지, 6장) |
| 리전 | `ap-northeast-2` (서울) |
| IAM 사용자 | `earcast` (콘솔 작업용 CLI 키 — ⚠️ 채팅 노출 이력, 재발급 필요) |

## 1. 컴퓨트·네트워크

| 리소스 | ID/값 | 비고 |
|---|---|---|
| EC2 인스턴스 | `i-07ecb129f1a45af8f` | t4g.small, AL2023 arm64, ap-northeast-2a, EBS gp3 20GB |
| Elastic IP | `3.39.4.29` (`eipalloc-0a99d84bad6167a5a`) | 가비아 A 레코드 2개가 이걸 가리킴 |
| 보안그룹 | `sg-02daeebb5783a9ac1` | 22(관리자 IP/32)·80·443/tcp·443/udp |
| 인스턴스 롤 | `ear-prod-ec2` | 인라인: `backup-put`(백업 PutObject) · `content-upload`(오디오 버킷 Put/Delete + KVS Describe/Put/DeleteKey) |
| IMDS | v2 강제, hop limit **2** | 컨테이너가 롤 자격증명을 읽기 위해 2 필요 |
| VPC | 기본 VPC `vpc-0926861fefd82e24e` | 서브넷 `subnet-0d2d9383d434d93c0` (2a) |

서버 안: `/opt/ear/backend` 코드 · `.env.prod` · docker compose 3컨테이너(caddy/api/postgres) · crond 백업(`0 19 * * *` UTC = 04시 KST).

## 2. 스토리지·CDN

| 리소스 | ID/값 | 비고 |
|---|---|---|
| S3 오디오 | `ear-audio-prod` | 비공개, `audio/*`(서명 재생)·`thumb/*`(공개 썸네일). 현재 비어 있음 |
| S3 백업 | `ear-backup-prod` | `pg/` 30일 라이프사이클. 일일 덤프 적재 중 |
| CloudFront 배포 | `E1J3IVMCCCXAUR` → `d1etxlf8jnqo2c.cloudfront.net` | 기본 동작: 서명 필수 + Function. `thumb/*` 동작: 무서명 |
| CloudFront Function | `ear-audio-rewrite` (viewer-request) | 소스: `backend/deploy/aws/audio-rewrite.function.js` |
| KeyValueStore | `ear-audio-map` — `arn:aws:cloudfront::574748894595:key-value-store/c794c540-d905-4889-b4f4-2bd3fd7b9404` | `contentId → S3 키`. 현재 비어 있음 |
| 서명 공개키 | `K3KE0PBPXGGQQ4` (Key Group `ear-audio-keygroup`) | 개인키: `backend/deploy/aws/out/cf_private.pem` (로컬 전용) |
| OAC | `ear-audio-oac` | S3는 이 배포에서만 읽힘 |

## 3. 도메인·DNS (가비아 — AWS 밖)

| 레코드 | 값 | 용도 |
|---|---|---|
| `api.earcast.co.kr` A | `3.39.4.29` | API (Caddy가 LE 인증서 자동) |
| `admin.earcast.co.kr` A | `3.39.4.29` | 관리자 콘솔 |
| `earcast.co.kr` (루트) | Vercel | 랜딩 — 이 문서 범위 밖 |

## 4. 운영 보조 (2026-08-30~31 생성)

| 리소스 | 값 | 비고 |
|---|---|---|
| Budgets | `ear-monthly-10usd` ($10, 80% 실적·100% 예측 메일) | 수신: 팀 대표 메일 |
| SNS 토픽 | `ear-prod-alerts` | 메일 구독 **확인 대기** (수신함에서 Confirm 필요) |
| CloudWatch 알람 | `ear-prod-ec2-status-check` | EC2 상태 검사 실패 3분 연속 시 알림 |
| SES | **미생성** (2026-08-31 계정 문제로 중단) | |

## 5. AWS 밖 짝 리소스

| 것 | 위치 | 비고 |
|---|---|---|
| Google OAuth 웹 클라이언트 | GCP `My First Project` — `475643832949-q10v…snist` | 콘솔 로그인 + 서버 `GOOGLE_WEB_CLIENT_ID`. JS 원본에 `https://admin.earcast.co.kr` 등록됨 |
| 관리자 계정 | DB `users` — runtime364@gmail.com, `role=admin` | id `52369519-31c9-4761-8912-006144c69683` |
| 로컬 비밀 묶음 | `backend/deploy/aws/out/` | `ear-prod.pem`(SSH) · `cf_private.pem`(CDN 서명) · `.env.prod` 사본 · `admin-config.js`. **이 폴더가 유일한 사본 — 백업해 둘 것** |

## 6. ⚠️ 계정 이관 — 판단과 절차

**상황**: 위 전부가 `574748894595`에 있는데, 이 계정이 의도한 팀 계정이 아닐 수 있다(2026-08-31).

### 6.1 이관 판단에 필요한 사실

- **계정에 묶여 되가져올 수 없는 것**: 리소스 ID 전부(버킷 이름 포함 — 글로벌 유니크라 기존 계정이 버킷을 지워야 새 계정에서 같은 이름 사용 가능), Elastic IP, CloudFront 도메인(`d1etxlf8…`), 프리티어 잔여분.
- **옮길 데이터**: DB 덤프 1개(`ear-backup-prod/pg/` 최신), S3 오디오·썸네일 오브젝트(현재 0개), KVS 항목(현재 0개). **지금은 사실상 데이터가 없어 이관 비용이 최소인 시점이다.**
- **코드는 계정 무관**: 셋업 스크립트·compose·콘솔 전부 저장소에 있고, 새 계정에서 [`runbook.md`](runbook.md) 1장 그대로 재구축하면 된다. 소요 실측 기준 2~3시간.
- 프리티어: EC2 12개월 무료는 **계정 단위**다. 새 계정이 프리티어 미사용 상태면 손해 없음.

### 6.2 이관 절차 (새 계정 `<NEW>` 기준)

1. `<NEW>` 계정에 IAM 사용자 생성(콘솔 절차는 runbook 1.1) → `aws configure`
2. [`runbook.md`](runbook.md) 1장 전체 재실행 (CDN 셋업 → EC2 → 서버 셋업). 버킷 이름이 충돌하면(구 계정이 아직 안 지움) `ear-audio-prod-2` 등으로 바꾸고 `.env.prod`의 `AUDIO_BUCKET`·`BACKUP_BUCKET`만 맞춘다
3. 데이터 이관: DB 최신 덤프 복원(runbook 5.3) · 오디오는 관리자 콘솔로 재업로드(0편이면 생략)
4. 가비아 A 레코드 2개를 새 Elastic IP로 교체 → Caddy가 인증서 재발급(자동)
5. `.env.prod`의 `AUDIO_URL_BASE_URL`·`CLOUDFRONT_KEY_PAIR_ID`·`CLOUDFRONT_PRIVATE_KEY_BASE64`·`AUDIO_KVS_ARN`을 새 셋업 출력값으로 교체 후 재기동
6. 콘솔 로그인 → 새 DB에서 관리자 승격(UPDATE) → 업로드 스모크 1회(runbook 3.3)
7. **구 계정 청소**: CloudFront 배포 비활성화→삭제, Function·KVS·키페어·OAC 삭제, 버킷 비우고 삭제, EC2 종료, EIP 반납(과금 방지), IAM 사용자·롤 삭제, Budgets·SNS·알람 삭제. **EIP 반납과 EC2 종료가 과금 정지의 핵심이다**

### 6.3 이관하지 않기로 하면

- `earcast` IAM 키 재발급(채팅 노출 이력)만 즉시 하고, 계정 소유·결제 수단을 팀 명의로 정리한다.
