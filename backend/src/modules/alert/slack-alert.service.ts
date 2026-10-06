import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

/**
 * 팀 알림 채널(Slack 웹훅)에 한 줄 남기는 공용 통로 — 가입·탈퇴 알림이 함께 쓴다(KAN-107 1단계 · 탈퇴 알림 2026-10-06).
 *
 * **본 흐름을 절대 방해하지 않는다.** 호출부는 `await` 하지 않고, 실패는 경고 로그로만 끝난다.
 * Slack 이 느리거나 죽어도 가입·탈퇴 응답이 밀리면 안 된다.
 *
 * **신원 값을 보내지 않는다** — 이메일·닉네임·user_id 는 문구에 넣지 않는다(`convention.md` 8.4 · CLAUDE.md 공통 원칙).
 * 채널에 필요한 것은 "누가"가 아니라 "들어오고 나가고 있다"이다. 문구는 각 알림 서비스의 순수 함수가 만든다.
 * 문구에 **바깥에서 온 글**을 넣는 쪽은 `escapeSlackText` 를 거친다 — 여기서 일괄로 바꾸지 않는 이유는
 * 문구의 인용 기호(`> `)까지 바뀌기 때문이다.
 *
 * **웹훅은 기존 알림 채널을 그대로 쓴다**(`SLACK_ERROR_WEBHOOK_URL`). 채널을 새로 만들지 않으려는 결정이다
 * (2026-09-29) — 덕분에 서버 env 를 건드리지 않고 배포만으로 켜진다. 알림만 다른 채널로 빼고 싶어지면
 * `SLACK_SIGNUP_WEBHOOK_URL` 을 넣으면 된다. **코드는 고치지 않는다.**
 */

/** Slack 응답 대기 상한 — 본 요청과 무관하게 돌지만, 떠 있는 연결을 오래 두지 않는다 */
const SLACK_TIMEOUT_MS = 3_000;

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

/**
 * 운영이 아니면 환경을 앞에 붙인다 — 같은 웹훅을 개발계에도 넣었을 때 섞이지 않게.
 * 운영에는 아무 표시도 없다(대부분의 줄이 운영이라, 없는 것이 기본이어야 읽힌다).
 */
export function withEnvironmentPrefix(
  text: string,
  environment?: string,
): string {
  const prefix =
    environment && environment !== 'production' ? `[${environment}] ` : '';
  return `${prefix}${text}`;
}

/**
 * **바깥에서 온 글**(스토어 리뷰 본문·탈퇴 사유 등)을 문구에 넣기 전에 Slack 제어 문자를 무력화한다.
 *
 * Slack 은 `text` 안의 `<…>` 를 명령으로 읽는다 — `<!channel>`·`<!here>` 는 채널 전체 호출, `<@U…>` 는 멘션,
 * `<https://주소|보이는 글자>` 는 위장 링크다. 리뷰는 스토어에 글을 쓸 수 있는 누구나 보낼 수 있어서, 그대로
 * 실으면 장애 알림 채널을 아무나 호출할 수 있다. Slack 이 정한 세 문자(`&` `<` `>`)만 엔티티로 바꾼다.
 *
 * **자른 뒤에 부른다** — 먼저 바꾸고 자르면 `&amp;` 가 중간에서 끊긴다. 우리가 만든 문구(이모지 코드·인용
 * 기호 `> `)에는 쓰지 않는다 — 인용 기호까지 바뀐다.
 */
export function escapeSlackText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

@Injectable()
export class SlackAlertService {
  private readonly logger = new Logger(SlackAlertService.name);
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

  /**
   * 던지지 않는다. 호출부에서 `await` 하지 말 것.
   * `kind` 는 실패 로그에만 쓴다 — 어느 알림이 못 나갔는지 알아야 고친다.
   */
  notify(kind: string, text: string): void {
    if (!this.enabled) return;

    void this.send(withEnvironmentPrefix(text, this.environment)).catch(
      (error: unknown) => {
        // 알림 실패는 본 흐름의 실패가 아니다 — 남기기만 한다
        this.logger.warn(`${kind} alert failed`, {
          reason: error instanceof Error ? error.message : 'unknown',
        });
      },
    );
  }

  /**
   * 결과를 기다리는 변형 — "보냈으면 기록한다"가 필요한 배치(스토어 리뷰 폴링)가 쓴다. 던지지 않고
   * 성공 여부만 돌려준다. 요청 경로에서는 `notify`를 쓴다(응답을 늦추지 않는다).
   */
  async post(kind: string, text: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      await this.send(withEnvironmentPrefix(text, this.environment));
      return true;
    } catch (error: unknown) {
      this.logger.warn(`${kind} alert failed`, {
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return false;
    }
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
