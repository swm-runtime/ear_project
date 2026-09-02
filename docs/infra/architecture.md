# 인프라 아키텍처 — 설계와 근거

| 항목 | 값 |
|---|---|
| 작성 | 2026-08-31 (구축 2026-08-25 설계 · 2026-08-30 실배포) |
| 상태 | 가동 중 — 리소스 실체는 [`inventory.md`](inventory.md), 절차는 [`runbook.md`](runbook.md) |
| 근거 문서 | `backend/architecture.md` 9.4(오디오 서명) · `backend/domain.md` 5.1(`audio_path` 비노출) · `tickets/backend/pending/api-server-deployment.md`(요구사항 원천) |

## 1. 목표와 제약

| # | 요구 | 출처 |
|---|---|---|
| R1 | HTTPS 공개 도메인의 API 서버 — FE 실기기 검증·소셜 로그인 종단 확인 | 티켓 `api-server-deployment` |
| R2 | 오디오 바이트를 **API 서버가 나르지 않는다** — 재생기는 CDN에 Range 요청 | `architecture.md` 9.4 |
| R3 | 오디오 URL에 저장소 키·제목이 새지 않는다. 재생 허가는 서버 판정 + 짧은 만료(5분) 서명 URL | `domain.md` 5.1 |
| R4 | 월 비용 3만원대 이하 (학생 팀, 수익 0) | 팀 여건 |
| R5 | 콘텐츠 업로드 경로 — 업로드 = 즉시 발행, 검수는 사람이 | `features/admin.md` |
| C1 | 운영 인원 1명(백엔드 겸임) — 관리형 서비스보다 **부품 수 최소화**가 우선 | |
| C2 | DNS는 가비아(외부), 루트 도메인 `earcast.co.kr`은 랜딩(Vercel)이 사용 중 → 서브도메인만 사용 가능 | |

## 2. 전체 구조

```
[Expo 앱 / 관리자 콘솔]
   │ JSON (HTTPS)
   ▼
api.earcast.co.kr ──▶ Caddy(TLS 자동발급) ─▶ api(NestJS) ─▶ postgres
admin.earcast.co.kr ─▶ Caddy file_server (정적 콘솔 1장)      │
   ▲ EC2 t4g.small 한 대, docker compose 3컨테이너            │ 업로드 시 쓰기
   │                                                          ▼
   │ 오디오·썸네일 바이트                     S3 ear-audio-prod (비공개)
   └── CloudFront d1etxlf8jnqo2c ◀──────────── ▲ OAC로만 읽힘
        ├ /play/<contentId>  : 서명 필수 + viewer-request Function이
        │                      KeyValueStore(contentId→키)로 URI 재작성
        └ /thumb/*           : 무서명 공개 (썸네일)

백업: postgres ──pg_dump 매일 04시 KST──▶ S3 ear-backup-prod (30일 자동 삭제)
```

- **JSON과 바이트의 분리가 설계의 중심이다(R2).** EC2 egress는 GB당 과금이지만 CloudFront는 월 1TB 무료 구간이 있다. 오디오가 서버를 지나는 순간 비용 모델(R4)이 깨진다.
- 관리자 콘솔은 별도 인프라가 아니라 **같은 Caddy의 정적 파일 서빙 한 블록**이다. 서버·빌드·배포가 늘지 않는다(C1).

## 3. 주요 결정과 근거

### 3.1 단일 EC2 + compose — ECS·RDS·ALB를 쓰지 않는다

| 대안 | 탈락 이유 |
|---|---|
| RDS | 월 1.5만+. MVP 트래픽에서 컨테이너 postgres + 일일 S3 덤프로 충분. 복구 절차는 runbook 5.3 |
| ALB | 월 2~3만. 서버가 1대라 분산 대상이 없다. TLS는 Caddy가 무료로 해결 |
| NAT Gateway | 월 3~4만. 퍼블릭 서브넷 1대 구성이라 필요 없다 |
| ECS/EKS | 운영 부품 증가(C1). compose 파일 하나로 동일 결과 |

t4g.small(arm64)은 프리티어 12개월 750h/월 — 첫 해 컴퓨트 0원. 이후 Lightsail $10 이전 옵션.

### 3.2 오디오 전달 — CloudFront 서명 URL (무작위 키 직접 서명)

> **개정 2026-08-31**: 원래 `/play/<contentId>` + KVS 재작성이었으나, 운영 계정(조직 SCP
> `p-5soyo0ar`)이 KVS 데이터 플레인을 전면 거부해 **무작위 저장소 키를 직접 서명**하는
> 방식으로 물렸다. 제목 비유출은 무작위 키가, 회수 차단은 5분 만료가 담당한다.
> 상세: `docs/changes/pending/audio-url-drops-play-rewrite.md`. 아래 원 설계 서술은 기록용.

#### (기록) 원 설계 — KeyValueStore 재작성

- **서명 URL(만료 5분)**: 재생 허가 판정(한도·회수·구독)은 API 서버가 하고, CloudFront는 서명만 검증한다. 판정은 서버 소유라는 원칙(팀 공통)과 일치.
- **`/play/<contentId>` 재작성**: CDN URL에 S3 키가 실리면 `audio_path` 비노출(R3)이 깨진다. viewer-request CloudFront Function이 KVS에서 `contentId → 키`를 찾아 재작성한다. S3 키는 업로드 시 무작위 hex 32자 — URL·DB 어디에도 제목이 없다.
- **검증 순서 (실측 2026-08-30)**: 서명 검증은 Function 재작성 **전** URI 기준이다. 서명 정책 Resource를 `/play/*`로 좁혀도 통과함을 확인 — 현재 코드는 배포 전체 `/*`이고, 좁히기는 선택 과제로 남김(`changes/pending/admin-web-console.md`).
- **KVS 전파 지연**: 쓰기 후 엣지 반영까지 수 초~10초. 발행 직후 `/play`가 잠깐 404일 수 있다(실측).
- **HLS를 쓰지 않는다**: 단일 파일 + Range 요청으로 "듣는 만큼만 전송"은 이미 성립. HLS는 세그먼트마다 URL이라 signed cookie가 필요한데 네이티브 재생기의 쿠키 전달이 보장되지 않는다.

### 3.3 썸네일 — 같은 버킷 `thumb/*`, 무서명 공개

썸네일은 목록·탐색에 항상 노출되는 값이라 서명 URL이 맞지 않는다(만료마다 목록이 깨진다). 같은 비공개 버킷에 두되 CloudFront에 `thumb/*` 전용 cache behavior(서명 검증 없음, Function 없음)를 추가했다. 키는 오디오와 같은 무작위 규칙.

### 3.4 관리자 업로드 — API 서버가 S3·KVS에 직접 쓴다

콘솔 → API(multipart) → 서버가 S3 업로드 + DB 트랜잭션 + KVS 등록. 브라우저 → S3 presigned 직행안은 탈락 — 업로드·발행·감사로그의 원자성(admin.md 4.2)을 서버 트랜잭션 한 곳에서 보장하기 위해서다. 자격증명은 **EC2 인스턴스 롤**(env에 키 없음).

### 3.5 TLS·도메인 — Caddy 자동발급, DNS는 가비아 수동

Caddy가 Let's Encrypt를 자동 발급·갱신한다(운영 손 0). DNS는 가비아 콘솔에서 A 레코드 수동 관리 — Route53 이관은 비용(월 $0.5)보다 "IaC로 못 다루는 수동 단계 하나"가 문제지만, 레코드가 2개뿐이라 수용했다.

## 4. 보안 경계

| 자산 | 통제 |
|---|---|
| S3 오디오 | 퍼블릭 차단 + 버킷 정책이 해당 CloudFront 배포 ARN만 허용(OAC). 직접 접근 403 확인 |
| 재생 URL | RSA 서명(키페어는 CloudFront Key Group), 만료 5분. 무서명 403·미등록 id 404 확인 |
| DB | 호스트 포트 미개방 — docker 네트워크 내부에서만. 접근은 SSH 후 `docker exec` |
| SSH | 보안그룹 22번이 관리자 IP `/32` 하나만. 키는 `out/ear-prod.pem` |
| 관리자 API | JWT `role=admin` 서버 검증(403). 관리자 승격은 DB 직접 UPDATE만 |
| 인스턴스 롤 | 최소권한: 백업 버킷 PutObject / 오디오 버킷 Put·Delete / KVS 3액션. IMDSv2 강제, hop limit 2(컨테이너) |
| 비밀값 | `.env.prod`(서버)·`deploy/aws/out/`(로컬)에만. 저장소 커밋 금지(.gitignore). ⚠️ 시크릿 매니저 미도입 — 티켓 `api-server-deployment` 요구사항 미충족 항목 |

## 5. 비용 모델 (월, 서울 리전)

| 항목 | 프리티어 중 | 이후 |
|---|---|---|
| EC2 t4g.small | 0 | ~2.2만 (또는 Lightsail $10) |
| EBS gp3 20GB | 0 | ~2천 |
| 퍼블릭 IPv4 1개 | 0 | ~5천 |
| CloudFront ≤1TB | 0 (영구 무료 구간) | 0 |
| CloudFront Functions ≤200만 호출 · KVS | 0 (영구 무료) | 0 |
| S3 (오디오 50GB 이하 + 백업) | ~1천 | ~2천 |
| **합계** | **~1천원** | **~3만원 + 도메인** |

깨지는 조건: 오디오가 EC2로 나가기 시작(R2 위반), CloudFront 월 1TB 초과(MAU 1만 규모까지 여유), RDS/ALB/NAT 추가. 20% 도달 알림: Budgets $10 (80%/예측 100% 시 메일).

## 6. 미결·알려진 한계

- 시크릿 매니저 미도입 — pepper·JWT_SECRET이 서버 파일시스템의 `.env.prod`에 있다.
- 배포가 수동(`git archive | ssh tar`, runbook 4장) — CI/CD 없음.
- 모니터링: EC2 상태 검사 CloudWatch 알람 1개뿐(메일 구독 확인 대기). 애플리케이션 레벨(5xx율·헬스) 감시 없음.
- 이메일 발송 — SES identity·프로덕션 신청까지 됨(DKIM DNS 대기). 서버 `SesMailClient` 구현은 미착수(`LoggingMailClient` 유지).
- `KAKAO_APP_ID`가 플레이스홀더 — 실값 필요(카카오 로그인만 실패).
- 스테이징 환경 없음 — 운영 한 벌뿐.
