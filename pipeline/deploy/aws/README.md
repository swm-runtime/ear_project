# pipeline/deploy/aws — 파이프라인 S3 버킷

파이프라인 산출물을 담는 **전용 비공개 버킷**과 버킷 한정 IAM 정책을 만든다. **계정은 제품 인프라와 같은 ISB 계정** — 리소스(버킷·정책·AI 서버 EC2·그 인스턴스 역할)만 추가한다. 근거는 [`docs/ai/spec/08-infra.md`](../../../docs/ai/spec/08-infra.md) 2장(저장 계층), 진행 순서는 spec/10 7장 M4.

```
s3://<PIPELINE_BUCKET>/            비공개 · Block Public Access · 버저닝 ON · SSE-S3 · TLS 강제
  episodes/{T260831-001}/          script.md claims.md sources.md(발췌) qa-report.md critic-report*.md upload-meta.json
  episodes/{id}/audio/             master.wav dist.mp3 timestamps.json
  sweeps/                          sweep-{날짜}-{중분류}-{job8}.json   ← 180일 후 만료
  datasets/{export 날짜}/           파인튜닝 데이터셋 export (spec/08 3.1·5장)
```

제품 버킷(`earcast-audio-prod`)과 **분리**한다 — 발췌는 재배포 금지 증적이라 서빙 경로 옆에 두지 않고, 워커·웹 권한을 이 버킷으로 한정하며, 버저닝·수명주기 정책이 다르다. 발행 `dist.mp3`는 파이프라인이 제품 버킷에 직접 쓰지 않고 **관리자 업로드**(spec/07 4장)로만 들어간다.

## 실행 (한 번, 멱등)

```bash
PIPELINE_BUCKET=earcast-pipeline-prod AWS_REGION=ap-northeast-2 pipeline/deploy/aws/setup-pipeline-bucket.sh
```

전제: `aws` CLI 로그인(ISB 계정은 SSO — `aws configure sso`). 조직 SCP가 어떤 생성을 막으면 해당 단계에서 멈춘다(`explicit deny in a service control policy`) — 그 경우 콘솔에서 같은 값으로 만들고 스크립트를 다시 돌리면 나머지 설정만 적용된다.

만드는 것: 버킷 1 · 버킷 정책(TLS 강제) · 수명주기 2규칙 · IAM 정책 `ear-pipeline-bucket-rw`(이 버킷의 `episodes/*`·`sweeps/*`·`datasets/*`만 Get/Put/List, **Delete 없음**). 끝에 AI 서버 EC2 인스턴스 역할(`ear-ai-ec2`, M6에서 생성)에 붙이는 명령을 출력한다.

## 자격증명 모델 — AWS 키는 EC2 한 곳에만

| 주체 | 자격증명 |
|---|---|
| AI 서버 EC2 (web + io 워커) | 인스턴스 역할 `ear-ai-ec2`에 `ear-pipeline-bucket-rw` 부착. 제품 롤 `ear-prod-ec2`는 재사용하지 않는다(제품 권한이 딸려감) |
| 팀원 Mac의 로컬 워커 | 없음 — 웹의 **서명 URL 라우트**(spec/10 2장 구조도)로 올리고 내린다. 노트북에 AWS 키를 두지 않는다 |
| EC2 전(M4 개발 중) | 임대 보유자의 SSO 프로필(`AWS_PROFILE`) — SDK가 단기 자격증명을 쓴다. 노트북 1대, 임시 |

IAM 사용자·액세스 키는 기본으로 만들지 않는다. 샌드박스 SCP가 장기 자격증명 생성을 막을 수 있고, 허용되더라도 노트북 3대에 키가 놓이는 구조는 피한다. 정말 필요하면 `WITH_IAM_USER=1`로 5단계를 켠다(→ `out/<버킷>.env`, gitignore).

## 사용하는 쪽 (M4 구현 — spec/10 3.3)

워커(`apps/worker/src/storage.ts`)는 단계 전 내려받기·후 올리기(md5↔ETag 멱등), 웹(`apps/web/lib/storage.ts`)은 `s3:` 키 읽기와 인라인 수정 PutObject + 로컬 워커용 서명 URL 라우트 `POST /api/storage`(공유 토큰 `PIPELINE_WORKER_TOKEN`). direct 접근의 env 는 `PIPELINE_BUCKET`·`AWS_REGION` 뿐이고 자격증명은 역할/SSO 프로필에서 온다. 이관: `npm run storage:migrate -- --apply`.

## 하지 않은 것 (의도)

- CloudFront·공개 읽기 없음 — 이 버킷은 사람(웹)과 워커만 읽는다
- 삭제 권한 없음 — 잘못 올린 건 버저닝으로 덮어쓰고, 정리는 콘솔에서 사람이
- 제품 버킷 권한 없음 — 같은 정책으로 서비스 오디오를 건드릴 수 없다
- 계정 분리 없음 — 제품과 같은 ISB 계정. 임대 만료 시 이관 대상에 이 버킷을 포함한다(`docs/infra/inventory.md` 체크리스트)

## 비용

텍스트 + 월 100편 원본 오디오 수준이라 월 수백~수천 원. 깨지는 조건은 `master.wav` 무제한 보관뿐 — 편수가 쌓이면 `audio/master.wav`에 IA 전환 규칙을 추가한다.
