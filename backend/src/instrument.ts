/**
 * Sentry 초기화 — **다른 어떤 모듈보다 먼저 로드되어야 한다.**
 *
 * 진입점(`main.ts`·`cluster.ts`)의 **첫 줄**에서 import 한다. NestJS SDK 는 계측을 위해
 * `@nestjs/core` 보다 먼저 init 되어 있어야 하고, CommonJS 로 컴파일되므로 첫 import 가
 * 곧 첫 실행이다. 순서를 바꾸면 조용히 계측이 빠진다.
 *
 * **`SENTRY_DSN` 이 없으면 아무 일도 하지 않는다.** 로컬·테스트·CI 에서 켜지지 않게 하는
 * 장치이자, 운영에서 잠깐 끄고 싶을 때 env 한 줄로 끄는 스위치다.
 *
 * ConfigService 를 쓰지 않고 `process.env` 를 직접 읽는 것은 이 파일이 Nest 부팅 **전에**
 * 돌기 때문이다. 값 검증은 `config/env.validation.ts` 가 따로 한다.
 */
import * as Sentry from '@sentry/nestjs';

import { SCHEDULER_WORKER_ENV } from '@/common/cluster.util';
import { scrubEvent } from '@/common/sentry-scrub';

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  const version = process.env.npm_package_version ?? 'unknown';

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    /**
     * 릴리스는 **앱 버전**이다(CLAUDE.md — 버전의 기준은 앱, `backend/package.json` 은 앱과 같게 둔다).
     * 이게 있어야 "이 에러가 어느 배포부터 생겼는가"가 Sentry 에서 자동으로 잡힌다.
     */
    release: `ear-api@${version}`,

    /**
     * **성능 추적은 기본으로 끈다(0).** 무료 할당량은 앱 크래시를 받는 데 쓴다 —
     * 서버 트랜잭션이 먼저 소진하면 정작 봐야 할 것이 가려진다(`tickets/.../sentry` 참조).
     * 느린 엔드포인트를 쫓을 일이 생기면 env 로 잠깐 올린다.
     */
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),

    /** IP·쿠키·헤더를 자동으로 싣지 않는다. 추가 세탁은 아래 beforeSend 가 한다 */
    sendDefaultPii: false,

    beforeSend: (event) => scrubEvent(event),

    initialScope: {
      tags: {
        /** 클러스터에서 어느 워커가 냈는지 — 특정 워커만 죽는 경우를 가른다 */
        scheduler_worker: process.env[SCHEDULER_WORKER_ENV] === 'true',
      },
    },
  });
}

/** 켜졌는지 — 부팅 로그에 한 줄 남기는 용도 */
export const sentryEnabled = Boolean(dsn);
