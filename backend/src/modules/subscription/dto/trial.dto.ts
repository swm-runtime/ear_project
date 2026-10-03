import { TrialView } from '../subscription.types';

/**
 * 가입 체험 안내 값(`subscription.md` 4.8) — 플랜 요약(`plan.trial`)에 실린다.
 * 프로필·설정·구독 조회가 같은 조립 함수(`buildPlanView`)의 결과를 같은 모양으로 내보낸다.
 */
export class TrialDto {
  /** 체험이 끝나는 시각(ISO 8601 UTC). 그 시각부터 하루 한도를 센다 */
  readonly ends_at: string;
  /** 체험으로 들을 수 있는 마지막 날(`YYYY-MM-DD`, 서비스 날짜). 안내 문구의 "N월 N일까지"는 이 값이다 */
  readonly last_free_date: string;
  /** 체험이 끝난 뒤의 하루 재생 한도. `null`은 무제한 */
  readonly daily_play_limit_after: number | null;

  static from(view: TrialView | null): TrialDto | null {
    return view === null
      ? null
      : {
          ends_at: view.endsAt.toISOString(),
          last_free_date: view.lastFreeDate,
          daily_play_limit_after: view.dailyPlayLimitAfter,
        };
  }
}
