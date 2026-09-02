# 이어 (ear)

> 출근길에 열면, 오늘 들을 게 준비되어 있어요.

**이어**는 2030 직장인을 위한 AI 오디오 팟캐스트 서비스입니다. 관심 주제를 한 번 정해두면,
매일 아침 15분짜리 2인 대화 에피소드가 자동으로 도착합니다 — 무엇을 들을지 고르는 탐색
시간을 없애는 것이 핵심 가치입니다.

🌐 [earcast.co.kr](https://earcast.co.kr)

## 구조

```
frontend/       모바일 앱 — React Native (Expo), iOS·Android
backend/        API 서버 — NestJS + PostgreSQL, AWS(EC2·S3·CloudFront) 단일 서버 배포
pipeline/       콘텐츠 파이프라인 실행체 — 주제 발굴부터 대본·QA·TTS·발행까지 (Next.js 웹 + Node 워커 + Supabase)
ai-server/      AI 보조 서버 — FastAPI
landing-page/   랜딩 페이지 — Next.js, Vercel
docs/           단일 진실 원천 — PRD·기능 명세·API 계약·스키마·인프라 문서
```

콘텐츠는 AI가 만들고 AI가 검수하되, **주제 승인·발행·판정은 사람이 합니다.**
대본 생성(2인 대화체) → 자동 QA(환각·정합성 검출) → 비평 → 사람 검수 → TTS 합성 → 발행.

## 기술

| 영역 | 스택 |
|---|---|
| 앱 | React Native (Expo), TypeScript |
| 서버 | NestJS, TypeORM, PostgreSQL, Docker Compose |
| 인프라 | AWS EC2·S3·CloudFront(서명 URL 스트리밍), Caddy(자동 TLS), SES |
| 파이프라인 | Next.js, Supabase, Claude (대본·QA·비평), ElevenLabs (TTS) |

## 개발

각 파트의 규칙과 명령은 파트 디렉토리의 `CLAUDE.md`·`README.md`를 따릅니다.
무엇을·왜 만드는지는 [`docs/`](docs/)가 기준입니다 — 문서와 코드가 어긋나면 문서를 먼저 고칩니다.

```bash
# 서버
cd backend && docker compose up -d && npm install && npm run start:dev

# 앱
cd frontend && npm install && npm start

# 콘텐츠 파이프라인 웹
cd pipeline && npm install && npm run dev -w apps/web
```

## 팀

**Run-Time** — SW마에스트로 17기
