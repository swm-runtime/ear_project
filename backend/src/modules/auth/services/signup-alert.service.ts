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
 * 자원 알림(`resource-alert.service.ts`)과 **채널을 나눈다** — 그쪽은 장애 알림이라
 * 사람이 즉시 반응해야 하고, 이쪽은 흘려보내며 보는 값이다. 섞으면 둘 다 안 보게 된다.
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

@Injectable()
export class SignupAlertService {
  private readonly logger = new Logger(SignupAlertService.name);
  private readonly webhookUrl: string;
  /** 운영·개발계를 가르는 값. `NODE_ENV` 는 양쪽 다 production 이라 쓸 수 없다 */
  private readonly environment: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.webhookUrl =
      configService.get('SLACK_SIGNUP_WEBHOOK_URL', { infer: true }) ?? '';
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
