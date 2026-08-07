/**
 * 재생 시작 API mock — 잔여 재생 상태(play_records의 대역)를 소유한다.
 * 라이브러리·탐색이 같은 잔여 숫자를 봐야 하므로(explore-uiux.md 4.2) 카운트 상태는
 * 진입점 feature가 아니라 여기 한 곳에만 둔다.
 *
 * 시나리오는 library mock과 같은 env(EXPO_PUBLIC_LIBRARY_MOCK_SCENARIO)를 읽는다 —
 * mock 서버는 하나이고, 화면별로 시나리오가 어긋나면 잔여 숫자 정합이 깨진다.
 * - (기본)      무료 티어(daily_play_limit=2, 오늘 1회 사용)
 * - fresh       가입 직후 — 오늘 0회 사용
 * - unlimited   무제한 티어 — 잔여 표시·확인 팝업이 나타나지 않아야 한다
 * - exhausted   오늘 한도 소진(0/2) — 페이월 진입 검증
 * - empty       빈 라이브러리 — 오늘 0회 사용
 *
 * 재생 시 라이브러리 항목의 상태 전이(unplayed → in_progress)는 library mock이 담당한다 —
 * 실서버에서 playback 모듈이 library Service를 호출하는 구조(library-api.md 8장)의 대역으로,
 * library mock이 registerPlayMockLibraryBridge로 자신을 등록한다.
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type { PlaybackProgressDto, PlayLimitFieldsDto, PlayStartResponseDto } from './player.dto';

const SCENARIO = process.env.EXPO_PUBLIC_LIBRARY_MOCK_SCENARIO ?? 'default';

/** 스켈레톤(0.3초 지연 규칙)이 실제로 보이도록 네트워크 지연을 흉내 낸다 */
const RESPONSE_DELAY_MS = 600;
/** 서비스 날짜는 서버가 04:00 KST 경계로 계산해 내려주는 값이다 — mock은 고정 라벨을 쓴다 */
const SERVICE_DATE = '2026-08-07';

/** 파트너 회수 시뮬레이션 — 목록에는 남아 있지만 재생하면 CONTENT_WITHDRAWN이 난다(L13) */
const WITHDRAWN_CONTENT_ID = 'content-12';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 시드 content id는 library mock의 항목과 맞춘 값이다(content-2: 듣다 만 콘텐츠) */
const initialPlayedToday = (): Set<string> => {
  if (SCENARIO === 'exhausted') return new Set(['content-2', 'content-3']);
  if (SCENARIO === 'unlimited' || SCENARIO === 'empty' || SCENARIO === 'fresh') return new Set();
  return new Set(['content-2']);
};

/** 오늘의 서비스 날짜에 카운트된 content_id 집합 — play_records의 mock */
let playedToday = initialPlayedToday();

export const resetPlayMock = (): void => {
  playedToday = initialPlayedToday();
};

/** 목록·복원 응답에 얹는 잔여 표시값 — library mock이 가져다 쓴다(library-api.md 2) */
export const mockPlayLimitFields = (): PlayLimitFieldsDto => ({
  daily_play_limit: SCENARIO === 'unlimited' ? null : 2,
  daily_play_count: SCENARIO === 'unlimited' ? null : playedToday.size,
  service_date: SERVICE_DATE,
});

/** is_counted_today의 근거 — 컬럼이 아니라 play_records 조회 결과다(library-api.md 4.1) */
export const isMockCountedToday = (contentId: string): boolean => playedToday.has(contentId);

/** 재생이 만든 라이브러리 쪽 변화 — 실서버의 library Service 호출에 대응한다 */
export interface PlayMockLibraryBridge {
  /** 상태 전이(unplayed → in_progress)·last_played_at 갱신 후 응답용 스냅샷을 돌려준다 */
  onPlayed: (contentId: string) => {
    library_item: PlayStartResponseDto['library_item'];
    progress: PlaybackProgressDto | null;
  } | null;
}

let libraryBridge: PlayMockLibraryBridge | null = null;

/** library mock이 모듈 로드 시점에 등록한다. 미등록이면 library_item: null로 응답한다 */
export const registerPlayMockLibraryBridge = (bridge: PlayMockLibraryBridge): void => {
  libraryBridge = bridge;
};

export const mockStartPlay = async (contentId: string): Promise<PlayStartResponseDto> => {
  await delay(RESPONSE_DELAY_MS);

  if (contentId === WITHDRAWN_CONTENT_ID) {
    throw new ApiError(
      ERROR_CODES.CONTENT_WITHDRAWN,
      '제공이 종료된 콘텐츠예요',
      false,
      null,
      null,
      403,
    );
  }

  const limit = mockPlayLimitFields().daily_play_limit;
  const alreadyCounted = playedToday.has(contentId);
  if (limit !== null && !alreadyCounted && playedToday.size >= limit) {
    // 무료 티어 기준의 mock — 유료 한도(PLAY_LIMIT_REACHED) 경로는 백엔드 연동 후 검증한다
    throw new ApiError(
      ERROR_CODES.PLAY_LIMIT_EXCEEDED,
      '오늘 들을 수 있는 콘텐츠를 모두 들었어요',
      false,
      null,
      null,
      403,
    );
  }

  playedToday.add(contentId);

  const libraryResult = libraryBridge?.onPlayed(contentId) ?? null;

  return {
    counted: !alreadyCounted,
    library_item: libraryResult?.library_item ?? null,
    progress: libraryResult?.progress ?? null,
    ...mockPlayLimitFields(),
  };
};
