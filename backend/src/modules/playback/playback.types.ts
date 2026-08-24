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

/** `AudioUrlSigner`가 만든 서명 URL. **어디에도 저장하지 않는다**(`architecture.md` 9.4) */
export interface SignedAudioUrl {
  url: string;
  expiresAt: Date;
  /** 갱신 스케줄링용 상대값. 기기 시계 오차와 무관하게 수신 시점부터 센다 */
  expiresInSec: number;
}

/**
 * 발급 요청의 입력. `deviceId` · `ip`는 `audio_access_logs`에만 쓰이며 **판정에 관여하지
 * 않는다**(domain.md 6.5 — 이상 탐지의 축이다).
 *
 * IP는 원문으로 받아 서비스가 해시한다. 컨트롤러가 해시하면 키를 아는 계층이 늘어난다.
 */
export interface IssueAudioUrlCommand {
  userId: string;
  contentId: string;
  deviceId: string;
  ip: string | null;
  now: Date;
}

/**
 * 발급 응답(`player-api.md` 4.1) — 메타 + URL을 **한 번에** 내려준다.
 *
 * 조회 엔드포인트를 따로 두지 않는 이유는 진입이 언제나 둘 다를 요구하고(`player.md` 4.1),
 * 왕복을 나누면 "탭 후 2초 내 재생 시작"(PRD 7)이 진입마다 2회가 되기 때문이다.
 */
export interface AudioUrlResult {
  content: {
    id: string;
    title: string;
    /** ai_generated는 null일 수 있다 — origin 분기 (domain.md 5.1) */
    authorName: string | null;
    sourceName: string;
    sourceUrl: string | null;
    durationSec: number;
    thumbnailUrl: string;
    contentVersion: number;
  };
  /** 라이브러리에 없는 콘텐츠면 `null` — 발급이 담기를 유발하지 않는다 */
  libraryItem: { id: string; status: string } | null;
  /** 행이 없으면 `null` — 0으로 채우지 않는다. 0부터 재생한다는 뜻이다 */
  progress: ProgressView | null;
  audio: SignedAudioUrl;
}

/** 위치 저장 요청(`player-api.md` 4.3) */
export interface SaveProgressCommand {
  userId: string;
  contentId: string;
  positionSec: number;
  maxReachedSec: number;
  /** **직전 반영 성공 이후**의 실제 재생 경과 시간. 절대값이 아니라 증분이다 */
  listenedSecDelta: number;
  /** 발급 응답에서 받은 값. 서버 값과 다르면 저장하지 않는다 */
  contentVersion: number;
  now: Date;
}

/** 위치 저장 결과 */
export interface SaveProgressResult {
  positionSec: number;
  maxReachedSec: number;
  /** 서버의 현재 버전. 요청과 다르면 클라이언트가 로컬 위치·오프라인 파일을 폐기한다 */
  contentVersion: number;
  /** 이 저장으로 완청이 판정되면 `completed`. 라이브러리에 없는 콘텐츠면 `null` */
  libraryItem: {
    id: string;
    status: string;
    completedAt: Date | null;
  } | null;
}

/**
 * `paywall.md` 4.1 판정 결과 — **허용된 경우에만 만들어진다**(거부는 예외로 나간다).
 *
 * **두 값을 하나로 합치지 않는다.** 무제한 티어에서 갈라지기 때문이다(결정 2026-08-11) —
 * 차감은 없지만(응답 `counted`는 false) 구독으로 지불된 재생이므로 재청취 창의 기산점은
 * 된다(`is_counted` 행은 true). 하나의 불리언으로는 이 조합을 표현할 수 없다.
 */
export interface PlayPermission {
  /**
   * 이 재생이 오늘 한도를 차감하는가 — 응답 `counted`의 근거(`library-api.md` 4.4).
   * 무제한 티어·재청취 창 안이면 거짓이다.
   */
  deductsQuota: boolean;
  /**
   * 이 재생이 재청취 창의 기산점이 되는가 — `play_records.is_counted`에 적는 값.
   *
   * 창 안의 재청취만 거짓이다 — 기산점이 되면 창이 청취할 때마다 갱신되어 영원히 닫히지
   * 않는다. **무제한 티어는 참이다**(결정 2026-08-11 — 유료 티어도 15일 재청취 권리를
   * 똑같이 지급한다. 강등 후에도 최근 들은 콘텐츠를 이어 들을 수 있다).
   */
  opensReplayWindow: boolean;
  /** `plans.daily_play_limit`. **null이면 무제한** */
  dailyPlayLimit: number | null;
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

/**
 * 콘텐츠별 누적 청취 시간 — 주제 분포 집계의 중간 산출물(`profile.md` 4.7).
 *
 * 주제까지 붙이지 않는 이유는 `content_topics`가 content 모듈 소유이기 때문이다
 * (domain.md 2장). 이 모듈은 콘텐츠 축까지만 접어서 넘긴다.
 */
export interface ContentListenedSecView {
  contentId: string;
  listenedSec: number;
}
