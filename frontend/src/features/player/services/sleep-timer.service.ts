import { playbackService } from './playback.service';
import { remainingSecOf, type SleepTimerChoice } from './sleep-timer';
import { usePlaybackStore } from '../store/playback.store';
import { useSleepTimerStore } from '../store/sleep-timer.store';

/** 남은 시간 갱신 주기 — 표시는 초 단위다 */
const TICK_MS = 1000;
/** 만료 때 소리를 줄이는 시간(`player.md` 4.7 — 페이드아웃 후 일시정지) */
const FADE_OUT_MS = 4000;

/**
 * 수면 타이머(FR-25 P1 — `player.md` 4.7).
 *
 * - 분 단위: 만료 시각까지 1초마다 남은 시간을 갱신하고, 만료되면 **페이드아웃 후 일시정지**한다. 앱은 종료하지 않는다.
 * - "이 에피소드 종료 시": 셀 시간이 없다. 편이 끝나면(완청) 재생은 스스로 멈추므로 타이머만 해제한다 —
 *   연속 재생이 없는 지금은 표시상의 약속이고, 연속 재생이 생기면 "다음 편으로 넘어가지 않는다"가 된다.
 * - 만료와 완청이 겹치면 완청이 우선이다(7장) — 세션이 끝나면 타이머를 먼저 걷어 페이드·일시정지를 하지 않는다.
 * - 재생을 멈춰 둔 동안에도 시간은 간다(벽시계 기준). 만료 때 이미 멈춰 있으면 아무 일도 하지 않는다.
 *
 * 만료 판정에 기기 시각을 쓴다 — 서비스 정책(한도·만료) 판정이 아니라 사용자가 건 알람이라 허용된다.
 */
class SleepTimerService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private endsAtMs: number | null = null;
  private unsubscribePlayback: (() => void) | null = null;

  /** 타이머를 건다 — 이미 걸려 있으면 새 선택으로 바꾼다 */
  start(choice: SleepTimerChoice): void {
    this.stopTicking();
    if (choice.kind === 'minutes') {
      this.endsAtMs = Date.now() + choice.minutes * 60_000;
      useSleepTimerStore.getState().set(choice, remainingSecOf(this.endsAtMs, Date.now()));
      this.interval = setInterval(() => this.onTick(), TICK_MS);
    } else {
      this.endsAtMs = null;
      useSleepTimerStore.getState().set(choice, null);
    }
    this.watchPlayback();
  }

  /** 해제 — 사용자가 고르거나, 세션이 끝나거나 걷혔을 때 */
  clear(): void {
    this.stopTicking();
    this.endsAtMs = null;
    this.unsubscribePlayback?.();
    this.unsubscribePlayback = null;
    useSleepTimerStore.getState().set(null, null);
  }

  private stopTicking(): void {
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
  }

  private onTick(): void {
    if (this.endsAtMs === null) return;
    const remaining = remainingSecOf(this.endsAtMs, Date.now());
    if (remaining > 0) {
      useSleepTimerStore.getState().tick(remaining);
      return;
    }
    // 만료 — 먼저 걷고(표시가 00:00 에 머물지 않게) 소리를 줄이며 멈춘다
    this.clear();
    playbackService.fadeOutAndPause(FADE_OUT_MS);
  }

  /** 세션이 끝나거나(완청) 사라지면(종료·교체 실패) 타이머도 걷는다 */
  private watchPlayback(): void {
    if (this.unsubscribePlayback !== null) return;
    this.unsubscribePlayback = usePlaybackStore.subscribe((state) => {
      const session = state.session;
      if (session === null || session.state === 'ended') this.clear();
    });
  }
}

export const sleepTimerService = new SleepTimerService();
