# @ear/web — 파이프라인 관리 UI

> 명세: [spec/10](../../../docs/ai/spec/10-webapp.md) 5장(화면) · 인증: Supabase Auth(팀 초대 이메일) · 데이터: Supabase 클라이언트(사용자 세션, RLS)

UI는 작업을 **요청**할 뿐이다 — `jobs`에 넣고, `backlog.status`를 바꾸고, 판정을 기록한다. 실행은 워커가 상태를 보고 한다(웹·워커 직접 통신 없음).

| 화면 | 내용 |
|---|---|
| `/` 대시보드 | 진행 중 작업·최근 완료·워커 상태(heartbeat) |
| `/topics` | `topics` CRUD (중분류·AI 생성 여부·해설 페르소나) |
| `/domains` | 소스 풀 — tier 필터·판정 시트(증거 `evidence`·tier·license_basis)·도메인 추가·자동 확인(domain_check) 요청 |
| `/sweep` | 중분류 선택 → 스윕 요청 → 자동 군집화 결과 |
| `/backlog` | 후보 카드 → 승인/반려/보류 (게이트 1 — 승인은 사람만) |
| `/episodes/[id]` | 대본 뷰어·턴 인라인 수정(재QA 요청)·발췌/claims/QA/비평 탭·비평 판정 폼·TTS 버튼(수동) |
| `/settings` | TTS 보이스·속도, 기본 모델, 프롬프트 버전(읽기) |

## 실행

```bash
cp .env.example .env.local     # NEXT_PUBLIC_SUPABASE_URL / ANON_KEY (팀 비밀 채널) · PIPELINE_BUCKET·AWS_REGION (+로컬은 AWS_PROFILE) · PIPELINE_WORKER_TOKEN
npm run dev -w apps/web        # pipeline/ 에서. http://localhost:3000
npm run build -w apps/web
```

- 산출물(`s3:` 키)은 파이프라인 S3 에서 읽고 쓴다(`lib/storage.ts`·`lib/artifacts.ts` — 자격증명은 EC2 인스턴스 역할, 로컬은 SSO 프로필). 이관 전 `local:` 키는 `WORK_ROOT`에서.
- `POST /api/storage` — 로컬 워커용 서명 URL 라우트(목록·GET·PUT, 공유 토큰 `PIPELINE_WORKER_TOKEN`). `proxy.ts` 의 로그인 리다이렉트에서 `/api/` 는 제외.
- 승인자·판정자·요청자는 클라이언트 값이 아니라 DB 트리거가 세션에서 찍는다(`supabase/migrations/0003`). 화면은 그 값을 보내지 않는다.
- `proxy.ts`가 미로그인 요청을 `/login`으로 보낸다. 서버 액션 외 별도 API 서버는 없다.
