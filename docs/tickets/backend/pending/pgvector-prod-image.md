# 운영 postgres 이미지를 pgvector 포함 이미지로 교체 반영

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-09-04 |
| 발행자 | infra (SSO 배포 중 발견) |
| 대상 | `backend/docker-compose.prod.yml` |

## 배경

2026-09-04 dev(HEAD 2e41360) 배포 시 `1786600000000-AddEmbeddingVectors` 마이그레이션이
`CREATE EXTENSION vector`를 요구하는데 운영 postgres 이미지(`postgres:16-alpine`)에 pgvector가
없어 api가 재시작 루프에 빠졌다(운영 502). **서버의 compose 파일은 현장에서
`pgvector/pgvector:pg16`으로 교체해 복구했고**(데이터 볼륨 유지, musl→glibc 콜레이션 차이
방어로 `REINDEX DATABASE` + `REFRESH COLLATION VERSION` 실행), 저장소 파일은 아직
`postgres:16-alpine`이다 — 다음 배포에서 되돌아가면 같은 장애가 재발한다.

## 수정 요청

- `backend/docker-compose.prod.yml`의 postgres `image:`를 `pgvector/pgvector:pg16`으로 교체
  (주석에 사유: 임베딩 마이그레이션의 CREATE EXTENSION vector).
- (선택) `deploy/aws/README.md`·`docs/infra/runbook.md`에 이미지 전제 한 줄.

## 완료 조건 (Given/When/Then)

- Given 저장소의 `backend/docker-compose.prod.yml`을 열었을 때, When 반영이 끝나면,
  Then postgres 서비스 image가 `pgvector/pgvector:pg16`이고 사유 주석이 있다.
- Given 새 EC2에 런북대로 재구축했을 때, When `up -d --build`가 끝나면,
  Then AddEmbeddingVectors 마이그레이션이 성공하고 api가 healthy다.

## 추가 기록 (2026-09-04)

- `REINDEX DATABASE`는 성공. `ALTER DATABASE … REFRESH COLLATION VERSION`은
  `invalid collation version change`로 실패 — 데이터 정합에는 영향 없고(재색인 완료)
  로그에 콜레이션 버전 경고가 남을 수 있는 수준. 재발 시 참고.
