import { WeeklyListeningView } from '../profile.types';

/**
 * profile-api.md 4.2 — 주간 그래프 한 주.
 *
 * **4.1의 `weekly_listening` 오브젝트와 같은 모양이다.** 두 응답이 다른 행 타입을 쓰면
 * 그래프 렌더가 두 벌이 된다.
 */
export class WeeklyListeningResponseDto {
  /** 그 주 월요일 라벨. 주 경계는 **월요일 04:00**(`domain.md` 1.2) */
  readonly week_start: string;
  /** 월~일 **7개 고정 배열**(초). 기록 없는 요일도 0으로 자리를 지킨다 */
  readonly daily_listened_sec: number[];
  /** `null`이면 이전 주가 없다(가입 주) → [◀] 비활성 */
  readonly previous_week_start: string | null;
  /** `null`이면 이번 주다 → [다음 주 ▶] 비활성 */
  readonly next_week_start: string | null;

  static from(view: WeeklyListeningView): WeeklyListeningResponseDto {
    return {
      week_start: view.weekStart,
      daily_listened_sec: view.dailyListenedSec,
      previous_week_start: view.previousWeekStart,
      next_week_start: view.nextWeekStart,
    };
  }
}
