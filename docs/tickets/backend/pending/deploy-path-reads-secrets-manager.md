# [BE] 배포 경로가 Secrets Manager에서 비밀값을 받아 오게 한다

| 항목 | 값 |
|---|---|
| 대상 | `backend/deploy/push.sh` · 신규 `backend/deploy/apply-secrets.py` |
| 요청 파트 | 백엔드 (인프라 → 백엔드) |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | `tickets/infra/pending/prod-secrets-storage.md`(KAN-35) 인프라 몫 완료 — AWS 쪽은 끝났고 배포 경로 연결만 남았다 |
| 근거 문서 | `tickets/infra/pending/prod-secrets-storage.md`(패치 제안 전문) · `backend/deploy/aws/README.md` |
| 심각도 | **하** — 지금도 `.env.prod`로 정상 동작한다. 다만 이걸 붙여야 KAN-35의 완료 조건이 찬다 |
| 상태 | 대기 |
| 연관 | Jira KAN-35(인프라) — 이 티켓이 닫혀야 그쪽 완료 조건 2가 찬다 |

## 배경 — AWS 쪽은 이미 끝났다

운영 시크릿을 AWS Secrets Manager로 옮겼다(2026-09-09, B안 채택).

| | |
|---|---|
| 시크릿 | `ear/prod/api` (ap-northeast-2) |
| 담긴 것 | 비밀 8종 — `DB_PASSWORD` `JWT_SECRET` `ARCHIVE_HASH_PEPPER` `WITHDRAWAL_HASH_PEPPER` `AUDIO_URL_SIGNING_KEY` `CLOUDFRONT_PRIVATE_KEY_BASE64` `PIPELINE_SSO_SECRET` `SLACK_ERROR_WEBHOOK_URL` |
| IAM | `ear-prod-ec2` 인라인 정책 `secrets-read` — `GetSecretValue`·`DescribeSecret`만, 리소스는 이 시크릿 하나 |
| 실측 | 인스턴스 롤로 조회 성공. 값 8종 전부 `.env.prod`와 sha256 일치. 같은 롤로 `PutSecretValue`·`ListSecrets`는 `AccessDenied` |

**`.env.prod` 35키 중 비밀 8개만 옮겼다.** 도메인·앱 버전·클라이언트 ID까지 넣으면 버전 하나
올릴 때마다 시크릿을 고쳐야 한다. 비밀이 아닌 설정의 원천은 여전히 `.env.prod`다.

## 요청 내용

**배포 경로에서 시크릿을 받아 `.env.prod`의 비밀 항목만 덮어쓴다.** 패치 제안 전문은
`tickets/infra/pending/prod-secrets-storage.md`에 있다. 요지만 옮긴다.

1. **신규 `backend/deploy/apply-secrets.py`** — 시크릿 JSON으로 `.env.prod`의 해당 키 **줄만
   치환**한다. 파일을 새로 만들지 않는다(비밀 아닌 설정이 날아간다).
   - **`.env.prod`에 없는 키는 추가하지 않고 실패시킨다.** 파일에 없다는 것은 이 서버가 그 값을
     안 쓴다는 뜻일 수 있어, 조용히 늘리는 쪽이 더 위험하다.
   - 값을 출력하지 않는다.
2. **`push.sh`의 재기동 블록 앞에 조회·갱신을 넣는다.** `set -e`라 **조회가 실패하면 `.env.prod`도
   컨테이너도 건드리지 않은 상태에서 멈춘다** — 돌던 API가 그대로 산다. `.env.prod.bak`을 한 세대
   남긴다.
3. **`docker-compose.prod.yml`은 바꿀 것이 없다** — `env_file: .env.prod` 그대로다.

## 왜 부팅 경로(entrypoint 조회)가 아닌가 — 확정된 판단

| | 배포 경로(채택) | 부팅 경로(기각) |
|---|---|---|
| 앱 이미지 | 무변경 | AWS CLI/SDK 추가 필요 |
| 디스크 비밀값 | 남음(현행과 동일) | 없음 |
| **조회 실패 시** | **컨테이너 건드리기 전 중단 — 돌던 API 생존** | **재기동 루프**(`restart: unless-stopped`) → 전면 중단 |

이 이관의 목적은 백업·통제·이력이지 "디스크에서 비밀값 제거"가 아니다(파일은 이미 600).
부팅 경로는 없던 가용성 위험을 새로 만든다 — **단일 서버라 Secrets Manager 장애 한 번이 곧
전면 중단이다.** 부팅 경로의 유일한 실이점(재부팅 시 최신값)은 회전 후 재배포를 절차에 넣으면
메워진다.

## 확인할 것

- **배포 후 첫 기동에서 `env.validation.ts`가 통과하는지.** 이게 KAN-35의 완료 조건 2다.
- 실패 시 `.env.prod.bak`으로 롤백되는지.
- `python3`가 운영 인스턴스에 있는지(없으면 같은 일을 하는 다른 수단으로 대체).

## 참고 — 값 교체 절차가 바뀐다

이제 비밀값을 갈 때 SSH로 파일을 편집하지 않는다.

```
aws secretsmanager put-secret-value --secret-id ear/prod/api --secret-string '<새 JSON>'
→ 재배포
```

`AWSPREVIOUS` 버전이 자동 보존되므로 잘못 바꿔도 되돌릴 자리가 있다. **자동 회전은 켜지 않았다** —
pepper 2종은 이미 저장된 해시와 짝이라 회전이 성립하지 않고, `JWT_SECRET`·`AUDIO_URL_SIGNING_KEY`는
구·신 키 동시 수용이 앱에 없어 회전 즉시 전 사용자 재로그인·서명 URL 파손이 된다. 앱에 키 롤오버가
생기면 별도 티켓으로 다룬다.

## 완료 조건

- Given `backend/**` 변경을 `dev`에 머지한다 / When 배포 워크플로가 돈다 / Then 시크릿을 받아 `.env.prod`의 비밀 8종이 갱신되고 API가 정상 기동한다
- Given 시크릿 조회가 실패하는 상황 / When 배포가 돈다 / Then `.env.prod`와 컨테이너가 **무변경**이고 배포는 실패로 끝난다
- Given 시크릿에만 있고 `.env.prod`에 없는 키 / When 갱신이 돈다 / Then 조용히 추가하지 않고 실패한다
- Given 배포 로그 / When 전체를 본다 / Then 비밀값이 어디에도 찍히지 않는다
