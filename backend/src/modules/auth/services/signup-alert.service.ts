import { Injectable } from '@nestjs/common';

import { SlackAlertService } from '@/modules/alert/slack-alert.service';
import { SocialProvider } from '@/modules/user/user.enum';

/**
 * 가입 알림 — 계정이 새로 생기면 팀 알림 채널에 한 줄 남긴다(KAN-107 1단계).
 * 전송·웹훅 선택·환경 표시는 `SlackAlertService` 가 맡고, 여기는 문구만 만든다.
 *
 * **신원 값을 보내지 않는다** — 이메일·닉네임·user_id 없이 제공자와 시각만이다
 * (`convention.md` 8.4). 채널에 필요한 것은 "누가"가 아니라 "들어오고 있다"이다.
 */

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
export function formatSignupText(provider: string, at: Date): string {
  const label = PROVIDER_LABEL[provider as SocialProvider] ?? provider;
  return `:wave: 가입 · ${label} · ${KST_TIME.format(at)}`;
}

@Injectable()
export class SignupAlertService {
  constructor(private readonly slackAlertService: SlackAlertService) {}

  /** 던지지 않는다. 호출부에서 `await` 하지 말 것 */
  notify(provider: string, at: Date): void {
    this.slackAlertService.notify('signup', formatSignupText(provider, at));
  }
}
