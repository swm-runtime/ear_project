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
import { resolveTracesSampleRate } from '@/common/sentry-options';
import { scrubEvent } from '@/common/sentry-scrub';

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  const version = process.env.npm_package_version ?? 'unknown';
  const tracesSampleRate = resolveTracesSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
  );

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    /**
     * 릴리스는 **앱 버전**이다(CLAUDE.md — 버전의 기준은 앱, `backend/package.json` 은 앱과 같게 둔다).
     * 이게 있어야 "이 에러가 어느 배포부터 생겼는가"가 Sentry 에서 자동으로 잡힌다.
     */
    release: `ear-api@${version}`,

    /**
     * **성능 추적은 기본으로 끈다 — 키를 아예 넣지 않는다.** `tracesSampleRate: 0` 은 "끔"이
     * 아니다: SDK 는 값이 있기만 하면 스팬을 켠 것으로 보고 express·nest·pg 계측을 전부
     * 등록해, 아무것도 보내지 않으면서 CPU 를 쓴다(2026-09-23 개발계 실측 — 온보딩 분당
     * 600명에서 API CPU 45~55% → 70~93%, `common/sentry-options.ts`). 무료 할당량도
     * 앱 크래시에 쓴다. 느린 엔드포인트를 쫓을 일이 생기면 **개발계에서만** env 로 잠깐 올린다 —
     * 운영은 t4g.small 한 대라 이 계측을 켤 여유가 없다.
     */
    ...(tracesSampleRate === undefined ? {} : { tracesSampleRate }),

    /**
     * **무엇을 수집할지 하나씩 끈다.** 예전 `sendDefaultPii: false` 는 v11 에서 사라지고,
     * 후속인 `dataCollection` 은 **기본값이 켜져 있는 항목이 많다** — 쿠키·헤더·요청 바디·
     * 스택 지역변수·DB 쿼리 데이터가 전부 기본 수집이다. 기본값에 기대면 SDK 를 올릴 때
     * 조용히 새는 쪽으로 바뀐다(2026-09-23 확인).
     *
     * convention.md 8장이 금지하는 것(토큰·인증 코드·이메일 원문·요청 바디)을
     * **SDK 층에서 먼저 끄고**, 그래도 새는 것을 `beforeSend` 가 한 번 더 턴다.
     */
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      /** 빈 배열 = 요청·응답 바디를 어느 방향으로도 싣지 않는다 */
      httpBodies: [],
      /**
       * **지역변수는 끈다.** 스택 프레임의 변수에는 비밀번호·토큰·요청 바디가 그대로 들어 있다.
       * 이름으로 거르는 방법은 번들링 뒤 이름이 바뀌어(`password` → `a`) 믿을 수 없다.
       */
      stackFrameVariables: false,
      /** 쿼리 파라미터에 이메일·토큰이 실릴 수 있다 */
      databaseQueryData: false,
      /**
       * URL 쿼리는 **남긴다** — 어느 엔드포인트였는지는 진단에 필요하다.
       * 민감한 값(`signature`)은 `beforeSend` 가 로그와 같은 규칙으로 가린다.
       */
      urlQueryParams: true,
    },

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
