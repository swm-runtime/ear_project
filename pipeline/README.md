# pipeline — 이어 콘텐츠 파이프라인 (web · worker)

자기계발을 원하는 2030 직장인을 위한 15분 2인 대화 팟캐스트를 만드는 파이프라인의 **실행체**다. 대본은 AI가 쓰고 검수도 AI가 하되, 주제 승인·발행·판정은 사람이 한다. 명세·프롬프트 자산은 [`docs/ai/`](../docs/ai/README.md)가 단일 원본이고, 이 디렉토리는 그것을 실행하는 코드만 담는다.

- 전체 그림: [`docs/ai/PIPELINE.md`](../docs/ai/PIPELINE.md) · 진행 상황: [`docs/ai/PIPELINE-STATUS.md`](../docs/ai/PIPELINE-STATUS.md)
- 이 코드의 명세: [`spec/10`](../docs/ai/spec/10-webapp.md) (웹 UI·워커·큐·연쇄) · 인프라·실행 계층: [`spec/08`](../docs/ai/spec/08-infra.md)
- 프롬프트 자산: [`docs/ai/skills/`](../docs/ai/skills/) — 워커가 **경로로** 반입한다(내용을 코드에 복사하지 않는다)

## 구조

```
apps/web           Next.js 16 관리 UI — 소스 풀 판정 · 스윕 요청 · 백로그 게이트 1 · 에피소드 판정·대본 수정 · 설정 (Supabase Auth 로그인)
apps/worker        작업 워커 — `jobs` 큐를 집어 sweep / cluster / draft / qa / critic / domain_check 실행 (실행기: claude-cli | api | none)
packages/pipeline  단계별 프롬프트 조립기 · 결과 JSON 스키마 (웹·워커 공용)
supabase/          schema.sql(스냅샷) + migrations/0002~ — 팀 공용 Supabase 프로젝트 (Free 플랜, 비용 0 원칙). 적용은 SQL 에디터에서 수동
deploy/            EC2 "AI 서버" 배포 (web + io 워커 + Caddy) — M6 에서 작성. 같은 인스턴스에 ../ai-server 동거
```

경로는 둘이다 — **`ASSET_ROOT`**(읽기 전용 프롬프트 자산, 기본 `../docs/ai`)와 **`WORK_ROOT`**(산출물 `episodes/`·`sources/sweeps/`, 기본 `pipeline/.work` — gitignore). 워커가 띄우는 `claude -p`의 cwd는 WORK_ROOT다. **레포 안 경로를 WORK_ROOT로 쓰지 않는다** — cwd가 레포 안이면 Claude Code가 루트 `CLAUDE.md`·`.claude/`를 자동 반입해 대본 생성 컨텍스트를 오염시킨다. 전환기에는 기존 로컬 산출물 폴더를 지정하면 DB의 `local:` 키가 그대로 해석된다.

## 시작하기

전제: Node 20+ · [Claude Code](https://claude.com/claude-code) 설치 후 `claude`에서 `/login` (워커의 AI 단계가 이 로그인 = 본인 구독을 쓴다). API 키는 쓰지 않는다.

```bash
cd pipeline
npm install

# 웹 (http://localhost:3000)
cp apps/web/.env.example apps/web/.env.local     # anon 키는 팀 비밀 채널에서
npm run dev -w apps/web

# 워커 (AI 단계는 본인 Claude Code 구독으로 실행)
cp apps/worker/.env.example apps/worker/.env      # DB 비밀번호는 팀 비밀 채널에서
npm run worker
```

- 로그인 계정은 Supabase Auth에 초대된 이메일만. 판정·승인은 로그인 계정으로 자동 기록된다(DB 트리거).
- 워커는 여러 대를 동시에 띄워도 된다 — 큐가 `FOR UPDATE SKIP LOCKED`로 분배한다. 비평은 Opus 고정(`CRITIC_MODEL`).
- 대본 생성 30분·비평 8~10분/편. 진행 상황은 웹 대시보드에서. 워커 상세는 [`apps/worker/README.md`](apps/worker/README.md).

## 지켜야 할 것

1. **비밀은 커밋하지 않는다** — `.env*`는 무시 목록(템플릿 `.env.example`만). DB 비밀번호·anon 키는 팀 비밀 채널로.
2. **Supabase는 비용 0** — Free 플랜 유지, Storage 안 씀, 큰 파일은 S3(M4).
3. **제3자 전사본(`references/*.txt`)은 레포에도, 프롬프트에도 넣지 않는다** — 분석 문서(`docs/ai/references/`)만 공유한다.
4. **소스 풀 계층 판정은 사람만** — 웹의 기계 제안·자동 확인(domain_check)은 보조 증거다. 403·봇 차단은 우회하지 않는다.
5. **검수 순서** — draft → QA(통과까지) → 비평은 QA 통과본에. 리포트 파일은 AI 스냅샷, 판정은 DB에.
6. **규칙을 고치면 연동 자산도 같이** — `docs/ai/skills/`의 guidelines ↔ 루브릭 ↔ 골드 ↔ QA 프롬프트 ↔ 이 코드의 생성 프롬프트(`packages/pipeline`), 그리고 CHANGELOG (spec/09 4.3).
7. **WORK_ROOT는 레포 밖** — 위 "구조" 참조. 실행 후 `git status`에 `docs/ai/` 변경이 보이면 모델이 자산을 건드린 것이다(`acceptEdits` 모드는 `--add-dir` 안의 수정을 자동 승인한다) — 되돌리고 원인을 본다.

## 지금 어디까지

M1(워커 연쇄)·M2(웹 골격) 완료, spec/09 v2 평가 체계로 전환 중(2026-09-01). 다음: M4 S3 산출물 이관(버킷 준비됨) → M6 EC2 배포(`deploy/`). 상세는 `docs/ai/PIPELINE-STATUS.md`.
