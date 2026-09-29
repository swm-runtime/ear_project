import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';
import { SocialProvider } from '@/modules/user/user.enum';

/**
 * 가입 알림 — 계정이 새로 생기면 Slack 에 한 줄 남긴다(KAN-107 1단계).
 *
 * **가입 자체를 절대 방해하지 않는다.** 호출부는 `await` 하지 않고, 실패는 경고 로그로만
 * 끝난다. Slack 이 느리거나 죽어도 가입 응답이 밀리면 안 된다.
 *
 * **신원 값을 보내지 않는다** — 이메일·닉네임·user_id 없이 제공자와 시각만이다
 * (`convention.md` 8.4). 채널에 필요한 것은 "누가"가 아니라 "들어오고 있다"이다.
 *
 * **웹훅은 기존 알림 채널을 그대로 쓴다**(`SLACK_ERROR_WEBHOOK_URL`). 채널을 새로 만들지
 * 않으려는 결정이다(2026-09-29) — 덕분에 서버 env 를 건드리지 않고 배포만으로 켜진다.
 * 나중에 가입 알림만 다른 채널로 빼고 싶어지면 `SLACK_SIGNUP_WEBHOOK_URL` 을 넣으면 된다.
 * **코드는 고치지 않는다.**
 */

/** Slack 응답 대기 상한 — 가입 응답과 무관하게 돌지만, 떠 있는 연결을 오래 두지 않는다 */
const SLACK_TIMEOUT_MS = 3_000;

const PROVIDER_LABEL: Record<SocialProvider, string> = {
  [SocialProvider.KAKAO]: '카카오',
  [SocialProvider.GOOGLE]: '구글',
  [SocialProvider.NAVER]: '네이버',
  [SocialProvider.APPLE]: '애플',
};

const KST_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * 알림 문구. 순수 함수라 서비스 없이 검증한다.
 * 모르는 제공자는 원값을 그대로 쓴다 — 알림이 조용히 비는 것보다 낫다.
 */
export function formatSignupText(
  provider: string,
  at: Date,
  environment?: string,
): string {
  const label = PROVIDER_LABEL[provider as SocialProvider] ?? provider;
  // 운영이 아니면 환경을 앞에 붙인다 — 같은 웹훅을 개발계에도 넣었을 때 섞이지 않게.
  // 운영에는 아무 표시도 없다(대부분의 줄이 운영이라, 없는 것이 기본이어야 읽힌다)
  const prefix =
    environment && environment !== 'production' ? `[${environment}] ` : '';
  return `${prefix}:wave: 가입 · ${label} · ${KST_TIME.format(at)}`;
}

/**
 * 쓸 웹훅을 고른다 — 전용 값이 있으면 그것, 없으면 기존 알림 채널.
 * 순수 함수라 ConfigService 없이 검증한다. 공백만 있는 값은 없는 것으로 본다
 * (env 를 지우는 대신 비워 두는 일이 흔하다).
 */
export function resolveWebhookUrl(
  signupWebhookUrl?: string,
  errorWebhookUrl?: string,
): string {
  return signupWebhookUrl?.trim() || errorWebhookUrl?.trim() || '';
}

@Injectable()
export class SignupAlertService {
  private readonly logger = new Logger(SignupAlertService.name);
  private readonly webhookUrl: string;
  /** 운영·개발계를 가르는 값. `NODE_ENV` 는 양쪽 다 production 이라 쓸 수 없다 */
  private readonly environment: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.webhookUrl = resolveWebhookUrl(
      configService.get('SLACK_SIGNUP_WEBHOOK_URL', { infer: true }),
      configService.get('SLACK_ERROR_WEBHOOK_URL', { infer: true }),
    );
    this.environment =
      configService.get('SENTRY_ENVIRONMENT', { infer: true }) ?? '';
  }

  /** 켜져 있는지 — 웹훅이 없으면 조용히 꺼진 상태다(로컬·테스트 기본) */
  get enabled(): boolean {
    return this.webhookUrl !== '';
  }

  /** 던지지 않는다. 호출부에서 `await` 하지 말 것 */
  notify(provider: string, at: Date): void {
    if (!this.enabled) return;

    void this.send(formatSignupText(provider, at, this.environment)).catch(
      (error: unknown) => {
        // 알림 실패는 가입 실패가 아니다 — 남기기만 한다
        this.logger.warn('signup alert failed', {
          provider,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      },
    );
  }

  private async send(text: string): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`slack webhook ${res.status}`);
  }
}
