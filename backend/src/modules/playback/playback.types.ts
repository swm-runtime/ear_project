/** convention.md 3.2 — 모듈 밖으로 공개되는 타입만 둔다 */

import { PlayEntryPoint, UserSignalAction } from './playback.enum';

/**
 * 추천 랭킹에 쓰는 행동 이력 한 줄(domain.md 6.4).
 *
 * **최근성 가중(`drip-scheduling.md` 4.3)에 `createdAt`이 반드시 필요하다** — 같은 신호라도
 * 오래된 것은 영향이 작아야 한다. 스코어링 자체는 이 모듈이 하지 않고 값만 넘긴다.
 */
export interface UserSignalView {
  contentId: string;
  action: UserSignalAction;
  createdAt: Date;
}

/** `playback_progresses` 조회 결과. **행이 없으면 `null`이며 0으로 채우지 않는다** */
export interface ProgressView {
  contentId: string;
  positionSec: number;
  maxReachedSec: number;
}

/**
 * 잔여 재생 표시값(library-api.md 2장). 목록·복원·재생 시작 응답이 **같은 이름으로** 싣는다.
 *
 * 남은 횟수(N)를 서버가 내려주지 않는다 — `N = max(0, limit - count)`는 화면이 계산한다.
 * 같은 값을 두 이름으로 내려주면 어느 쪽이 맞는지 판단해야 하는 순간이 생긴다.
 */
export interface DailyPlayQuota {
  /** `plans.daily_play_limit`. **null이면 무제한** */
  dailyPlayLimit: number | null;
  /**
   * `play_records` 집계. **`dailyPlayLimit`이 null이면 이 값도 null이다** —
   * 무제한 티어에 0을 내려주면 화면이 카운터를 그릴 근거가 생긴다(library-api.md 2장).
   */
  dailyPlayCount: number | null;
  /** 04시 경계로 계산한 오늘의 서비스 날짜 (`YYYY-MM-DD`) */
  serviceDate: string;
}

export interface StartPlayCommand {
  userId: string;
  contentId: string;
  /** 전환 분석용. **판정에 쓰지 않는다** */
  entryPoint: PlayEntryPoint;
  now: Date;
}

/** 재생 시작 결과(library-api.md 4.4) */
export interface StartPlayResult {
  /** 이 요청으로 `play_records` 행이 **새로 생겼는가**. 이미 오늘 카운트된 콘텐츠면 false */
  counted: boolean;
  /** 라이브러리에 없는 콘텐츠를 재생하면 `null` — 재생이 담기를 유발하지 않는다 */
  libraryItem: {
    id: string;
    status: string;
    lastPlayedAt: Date | null;
  } | null;
  progress: ProgressView | null;
  quota: DailyPlayQuota;
}
