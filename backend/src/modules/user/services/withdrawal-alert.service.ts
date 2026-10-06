import { Injectable } from '@nestjs/common';

import { SlackAlertService } from '@/modules/alert/slack-alert.service';

import { WithdrawalReason } from '../user.enum';

/**
 * 탈퇴 알림 — 계정이 지워지면 팀 알림 채널에 사유와 함께 한 줄 남긴다(2026-10-06, 가입 알림의 짝).
 * 전송·웹훅 선택·환경 표시는 `SlackAlertService` 가 맡고, 여기는 문구만 만든다.
 *
 * **신원 값을 보내지 않는다** — 이메일·닉네임·user_id 는 싣지 않는다(CLAUDE.md 공통 원칙). 사유 코드·직접 입력
 * 사유·가입 뒤 며칠 만인지·결제 이력 여부만이다. 직접 입력 사유는 사용자가 쓴 문장이라 그대로 싣되 길이를 자른다 —
 * 그 문장이 바로 팀이 들어야 할 목소리다(KAN-133 VoC 와 같은 취지).
 */

/** 직접 입력 사유 상한 — Slack 한 줄에 읽히는 길이. 넘치면 말줄임 */
export const REASON_TEXT_MAX_LENGTH = 200;

/** 화면이 보여 주는 선택지 문구와 같다(`auth-uiux.md` 탈퇴 사유). 값은 `WithdrawalReason` */
const REASON_LABEL: Record<WithdrawalReason, string> = {
  [WithdrawalReason.CONTENT_QUALITY]: '콘텐츠 품질이 기대에 못 미쳤어요',
  [WithdrawalReason.RECOMMENDATION_MISMATCH]:
    '제 관심사와 맞지 않는 콘텐츠가 왔어요',
  [WithdrawalReason.LOW_USAGE]: '들을 시간이 없거나 잘 안 쓰게 됐어요',
  [WithdrawalReason.PRICE]: '구독 가격이 부담됐어요',
  [WithdrawalReason.NOT_ENOUGH_CONTENT]: '듣고 싶은 주제 콘텐츠가 부족했어요',
  [WithdrawalReason.APP_ISSUE]: '앱 오류나 사용이 불편했어요',
  [WithdrawalReason.ALTERNATIVE]: '다른 서비스를 이용하게 됐어요',
  [WithdrawalReason.OTHER]: '기타',
};

const KST_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WithdrawalAlertInput {
  reasonCode: WithdrawalReason | null;
  reasonText: string | null;
  /** 가입 시각 — "가입 N일차" 환산용. 탈퇴 뒤에는 행이 없으므로 지우기 전에 읽어 둔다 */
  signedUpAt: Date;
  hadPaymentHistory: boolean;
}

/**
 * 알림 문구. 순수 함수라 서비스 없이 검증한다.
 *
 * 한 줄: `:door: 탈퇴 · <사유> · 가입 N일차 · (결제 이력 있음 ·) MM. DD. HH:mm`(가입 알림과 같은 KST 표기)
 * 직접 입력 사유가 있으면 둘째 줄에 인용으로 붙인다. 모르는 사유 코드는 원값을 그대로 쓴다 — 조용히 비는 것보다 낫다.
 */
export function formatWithdrawalText(
  input: WithdrawalAlertInput,
  at: Date,
): string {
  const reason =
    input.reasonCode === null
      ? '사유 미선택'
      : (REASON_LABEL[input.reasonCode] ?? input.reasonCode);
  const dayIndex =
    Math.floor((at.getTime() - input.signedUpAt.getTime()) / DAY_MS) + 1;
  const parts = [
    ':door: 탈퇴',
    reason,
    `가입 ${Math.max(dayIndex, 1)}일차`,
    ...(input.hadPaymentHistory ? ['결제 이력 있음'] : []),
    KST_TIME.format(at),
  ];

  const detail = input.reasonText?.trim();
  if (!detail) return parts.join(' · ');

  // 줄바꿈은 공백으로 — 인용 블록이 여러 줄로 갈라지지 않게
  const flat = detail.replace(/\s+/g, ' ');
  const clipped =
    flat.length > REASON_TEXT_MAX_LENGTH
      ? `${flat.slice(0, REASON_TEXT_MAX_LENGTH)}…`
      : flat;

  return `${parts.join(' · ')}\n> ${clipped}`;
}

@Injectable()
export class WithdrawalAlertService {
  constructor(private readonly slackAlertService: SlackAlertService) {}

  /** 던지지 않는다. 호출부에서 `await` 하지 말 것 — 탈퇴 트랜잭션이 끝난 뒤에 부른다 */
  notify(input: WithdrawalAlertInput, at: Date): void {
    this.slackAlertService.notify(
      'withdrawal',
      formatWithdrawalText(input, at),
    );
  }
}
