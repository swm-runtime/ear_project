# pipeline 모노레포 이미지 — web(Next.js)과 worker 가 같은 이미지를 쓴다 (spec/10 M6).
#   web:    기본 CMD (next start)
#   worker: compose 에서 command 로 덮는다 (EXECUTOR=none · CAPABILITIES=io — IO 전용, 구독 토큰 없음)
# 빌드 컨텍스트는 pipeline/ 이다:  docker build -f deploy/Dockerfile .
FROM node:22-alpine

WORKDIR /srv/pipeline

# 의존성 레이어 — 소스보다 먼저 복사해 캐시를 살린다
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/pipeline/package.json packages/pipeline/
RUN npm ci --ignore-scripts

COPY . .

# NEXT_PUBLIC_* 는 빌드 시점에 클라이언트 번들에 박힌다 (anon 키는 RLS 뒤라 브라우저 노출 가능 값)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w apps/web

# 워커 기록용 리비전 — 이미지에는 .git 이 없어 빌드 인자로 박는다 (assets.ts workerRev 가 읽음)
ARG WORKER_REV=unknown
ENV WORKER_REV=$WORKER_REV \
    NODE_ENV=production

EXPOSE 3000
CMD ["npm", "run", "start", "-w", "apps/web"]
