/**
 * 재생 API mock — 잔여 재생 상태(play_records의 대역)와 player 고유 계약(player-api.md —
 * 서명 URL 발급·위치 저장·replay·원문 클릭)의 서버 대역을 소유한다.
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
 * 라이브러리 항목의 상태 전이·진행 저장·완청 판정(서버 대역)은 library mock이 담당한다 —
 * 실서버에서 playback 모듈이 library Service를 호출하는 구조(library-api.md 8장)의 대역으로,
 * library mock이 registerPlayMockLibraryBridge로 자신을 등록한다.
 */
import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type { QueueItem, ScriptSegment } from '../player.types';
import type {
  AudioUrlsResponseDto,
  PlaybackProgressDto,
  PlaybackProgressPutRequestDto,
  PlaybackProgressPutResponseDto,
  PlayLimitFieldsDto,
  PlayStartResponseDto,
  WithdrawnContentsResponseDto,
} from './player.dto';

const SCENARIO = process.env.EXPO_PUBLIC_LIBRARY_MOCK_SCENARIO ?? 'default';

/** 스켈레톤(0.3초 지연 규칙)이 실제로 보이도록 네트워크 지연을 흉내 낸다 */
const RESPONSE_DELAY_MS = 600;
/** 발급은 "탭 후 2초 내 재생 시작"(PRD 7)의 경로다 — 목록 조회보다 짧은 지연을 준다 */
const ISSUE_DELAY_MS = 300;
/** 서비스 날짜는 서버가 04:00 KST 경계로 계산해 내려주는 값이다 — mock은 고정 라벨을 쓴다 */
const SERVICE_DATE = '2026-08-07';

/** 파트너 회수 시뮬레이션 — 목록에는 남아 있지만 재생하면 CONTENT_WITHDRAWN이 난다(L13) */
const WITHDRAWN_CONTENT_ID = 'content-12';

/**
 * 서명 URL의 대역 — 공개 샘플 오디오(약 6분)를 쓴다. 실제 서명 URL처럼 만료를 흉내 내지는
 * 않는다(만료 판정은 스토리지 몫 — player-api.md 4.1). 갱신 흐름은 expires_in_sec으로 검증한다.
 */
const SAMPLE_AUDIO_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const AUDIO_EXPIRES_IN_SEC = 300;

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

/** 재생이 만드는 라이브러리 쪽 변화 — 실서버의 library Service 호출에 대응한다 */
export interface PlayMockLibraryBridge {
  /** 상태 전이(unplayed → in_progress)·last_played_at 갱신 후 응답용 스냅샷을 돌려준다 */
  onPlayed: (contentId: string) => {
    library_item: PlayStartResponseDto['library_item'];
    progress: PlaybackProgressDto | null;
  } | null;
  /** 발급 응답의 콘텐츠 메타·항목 스냅샷(player-api.md 4.1) — 라이브러리에 없으면 null */
  getContentSnapshot: (contentId: string) => {
    content: Omit<AudioUrlsResponseDto['content'], 'source_url'>;
    library_item: AudioUrlsResponseDto['library_item'];
    progress: PlaybackProgressDto | null;
  } | null;
  /**
   * 위치 저장 + 완청 판정의 서버 대역(player-api.md 4.3 서버 처리 4~6).
   * max_reached가 길이의 90%에 닿으면 completed로 전이해 스냅샷을 돌려준다.
   */
  onProgressSaved: (
    contentId: string,
    positionSec: number,
    maxReachedSec: number,
  ) => PlaybackProgressPutResponseDto['library_item'];
}

let libraryBridge: PlayMockLibraryBridge | null = null;

/** library mock이 모듈 로드 시점에 등록한다. 미등록이면 library_item: null로 응답한다 */
export const registerPlayMockLibraryBridge = (bridge: PlayMockLibraryBridge): void => {
  libraryBridge = bridge;
};

/**
 * 발급·재생 시작 공용 판정(paywall.md 4.1의 대역) — 판정 함수가 두 벌이면 발급은 되는데
 * 재생은 막히는 어긋남이 생긴다(player-api.md 3장 설계 메모).
 */
const assertMockPlayable = (contentId: string): void => {
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
  // 오늘 카운트된 콘텐츠는 재청취 창 내(paywall.md 4.3-1) — 한도 검사보다 먼저 ALLOW
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
};

export const mockStartPlay = async (contentId: string): Promise<PlayStartResponseDto> => {
  await delay(RESPONSE_DELAY_MS);
  assertMockPlayable(contentId);

  const alreadyCounted = playedToday.has(contentId);
  playedToday.add(contentId);

  const libraryResult = libraryBridge?.onPlayed(contentId) ?? null;

  return {
    counted: !alreadyCounted,
    library_item: libraryResult?.library_item ?? null,
    progress: libraryResult?.progress ?? null,
    ...mockPlayLimitFields(),
  };
};

/** 탐색 전용 콘텐츠 등 라이브러리 mock에 없는 대상의 폴백 메타 */
const fallbackContentMeta = (
  contentId: string,
): Omit<AudioUrlsResponseDto['content'], 'source_url'> => ({
  id: contentId,
  title: '탐색에서 재생한 콘텐츠',
  author_name: '저자 미상',
  source_name: '이어 스튜디오',
  duration_sec: 300,
  thumbnail_url: `https://picsum.photos/seed/${contentId}/200`,
  content_version: 1,
});

/**
 * contents.origin의 mock 규칙 — seq % 5 === 3이면 원문 없는 AI 자체 생성분(ai_generated),
 * 나머지는 파트너 원문(partner)이다. 발급 응답의 source_url·상세의 origin 분기·목록의
 * [원문 보기] 노출이 전부 이 한 곳을 봐야 한다 — 규칙이 두 벌이면 같은 콘텐츠의
 * [원문 보기] 유무가 화면마다 어긋난다(2026-08-24 통일 — 종전 발급 전용 규칙 seq % 4 폐기).
 */
export const isMockAiGeneratedContent = (contentId: string): boolean => {
  const seq = Number(contentId.replace(/\D/g, ''));
  return Number.isFinite(seq) && seq % 5 === 3;
};

/** contents.source_url의 대역 — partner만 원문 링크가 있다(domain.md 5.1 체크 제약의 대역) */
export const getMockSourceUrl = (contentId: string): string | null =>
  isMockAiGeneratedContent(contentId) ? null : `https://example.com/original/${contentId}`;

/** POST /contents/:id/audio-urls의 대역 — 판정은 하되 차감하지 않는다(player-api.md 4.1) */
export const mockIssueAudioUrls = async (contentId: string): Promise<AudioUrlsResponseDto> => {
  await delay(ISSUE_DELAY_MS);
  assertMockPlayable(contentId);

  const snapshot = libraryBridge?.getContentSnapshot(contentId) ?? null;
  const content = snapshot?.content ?? fallbackContentMeta(contentId);

  return {
    content: { ...content, source_url: getMockSourceUrl(contentId) },
    library_item: snapshot?.library_item ?? null,
    progress: snapshot?.progress ?? null,
    audio: {
      url: SAMPLE_AUDIO_URL,
      expires_at: new Date(Date.now() + AUDIO_EXPIRES_IN_SEC * 1000).toISOString(),
      expires_in_sec: AUDIO_EXPIRES_IN_SEC,
    },
  };
};

/** PUT /users/me/playback-progresses/:id의 대역 — 완청 판정은 여기(서버 대역)서만 일어난다 */
export const mockSavePlaybackProgress = async (
  contentId: string,
  body: PlaybackProgressPutRequestDto,
): Promise<PlaybackProgressPutResponseDto> => {
  // 백그라운드 동기화라 화면 지연 검증이 필요 없다 — 짧은 지연만 준다
  await delay(150);
  const libraryItem =
    libraryBridge?.onProgressSaved(contentId, body.position_sec, body.max_reached_sec) ?? null;
  return {
    position_sec: body.position_sec,
    max_reached_sec: body.max_reached_sec,
    content_version: body.content_version,
    // mock 은 회수를 흉내 내지 않는다 — 회수는 관리자 조작으로만 일어나고
    // 그 경로는 실서버에서만 재현된다(player-api.md 4.3)
    content_status: 'published',
    library_item: libraryItem,
  };
};

/**
 * GET /contents/withdrawn의 대역(player-api.md 4.6) — mock 은 회수를 흉내 내지 않으므로
 * 항상 빈 목록이다. 회수는 관리자 조작으로만 일어나 실서버에서만 재현된다.
 */
export const mockGetWithdrawnContents = async (): Promise<WithdrawnContentsResponseDto> => {
  await delay(100);
  return { content_ids: [] };
};

/** POST /contents/:id/replay의 대역 — 신호 적재뿐이라 상태 변화가 없다(player-api.md 4.4) */
export const mockSendReplaySignal = async (_contentId: string): Promise<void> => {
  await delay(150);
};

/** POST /contents/:id/source-link-clicks의 대역 — 클릭 1회 = 1행 적재(player-api.md 4.5) */
export const mockSendSourceLinkClick = async (_contentId: string): Promise<void> => {
  await delay(150);
};

/* ── 스크립트(PL6, P1) mock — 2인 대화체 대본을 재생 길이에 맞춰 문단으로 편다(2026-09-16 시연용) ── */

const MOCK_SCRIPT_LINES: readonly [string, string][] = [
  [
    '윤아',
    '오늘은 오래 일하는 사람들의 습관 이야기를 해볼게요. 이음 님은 하루를 어떻게 시작하세요?',
  ],
  ['이음', '저는 출근하면 메일부터 안 열어요. 제일 중요한 일 하나를 먼저 30분 잡고 시작합니다.'],
  ['윤아', '메일을 먼저 열면 남의 우선순위로 하루가 시작된다는 얘기가 있죠.'],
  [
    '이음',
    '맞아요. 그리고 오래 일하는 분들 공통점이 하나 있는데, 일을 끝내는 시간을 정해둔다는 거예요.',
  ],
  ['윤아', '끝내는 시간이요? 시작 시간이 아니라?'],
  [
    '이음',
    '네. 끝이 정해져 있어야 그 안에서 뭘 버릴지 결정하게 되거든요. 무한정이면 다 붙잡고 있게 돼요.',
  ],
  [
    '윤아',
    '그게 번아웃이랑도 연결되는 것 같아요. 제 주변에 10년 넘게 한 분야에서 일하는 분들은 쉬는 걸 잘하더라고요.',
  ],
  ['이음', '쉬는 것도 기술이죠. 회복이 안 되면 다음 날 집중력이 반으로 떨어지니까요.'],
  ['윤아', '두 번째 습관으로 넘어가 볼까요. 기록이요.'],
  ['이음', '오래 일하는 사람들은 자기 실수를 기록해요. 잘한 건 기억이 나는데 실수는 반복하거든요.'],
  ['윤아', '실수 노트 같은 거네요. 저는 주간 회고를 쓰는데 비슷한 효과가 있어요.'],
  [
    '이음',
    '회고에서 중요한 건 "다음엔 뭘 다르게 할까" 한 줄이에요. 감상만 쓰면 다음 주에 똑같아요.',
  ],
  ['윤아', '세 번째는 관계 얘기를 해보고 싶어요. 혼자 오래 일하긴 어렵잖아요.'],
  ['이음', '동료한테 먼저 묻는 사람이 오래 가요. 모르는 걸 숨기는 데 쓰는 에너지가 생각보다 커요.'],
  ['윤아', '질문하는 게 약점이 아니라는 걸 아는 팀이면 더 그렇죠.'],
  [
    '이음',
    '그리고 자기 일의 의미를 스스로 설명할 수 있어야 해요. 왜 이 일을 하는지 한 문장으로요.',
  ],
  ['윤아', '그 문장이 흔들릴 때가 이직 신호일 수도 있고요.'],
  ['이음', '네, 그래서 가끔 꺼내 보는 게 좋아요. 1년에 한 번쯤은요.'],
  [
    '윤아',
    '정리해 볼게요. 제일 중요한 일부터, 끝내는 시간을 정하고, 실수를 기록하고, 먼저 묻고, 의미를 말할 수 있을 것.',
  ],
  ['이음', '다섯 개 중에 하나만 이번 주에 해보셔도 충분해요. 다 하려고 하면 그게 또 오래 못 가요.'],
  ['윤아', '오늘 이야기는 여기까지예요. 내일 출근길에 또 만나요.'],
  ['이음', '고맙습니다. 편안한 하루 보내세요.'],
];

/**
 * 스크립트 mock — 길이를 문단 수로 나눠 균등하게 시간을 붙인다. AI 생성 콘텐츠(seq % 5 === 3)는
 * "스크립트 없음"으로 두어 손잡이 미노출 경로(uiux 4.6)를 함께 확인한다.
 */
export const getMockScript = async (
  contentId: string,
  durationSec: number,
): Promise<ScriptSegment[] | null> => {
  await delay(RESPONSE_DELAY_MS);
  if (isMockAiGeneratedContent(contentId)) return null;

  const total = Math.max(durationSec, 60);
  const step = total / MOCK_SCRIPT_LINES.length;
  return MOCK_SCRIPT_LINES.map(([speaker, text], index) => ({
    startSec: Math.round(index * step),
    endSec: Math.round((index + 1) * step),
    speaker,
    text,
  }));
};

/* ── 다음 재생 목록 mock(2026-09-16 시연용) — 현재 콘텐츠 다음 번호부터 6편. 실제 순서 규칙은 미정 ── */

const MOCK_QUEUE_TOPICS = ['생산성', 'AI·테크 트렌드', '커뮤니케이션', '리더십', '커리어'] as const;

export const getMockQueue = async (contentId: string): Promise<QueueItem[]> => {
  await delay(RESPONSE_DELAY_MS);
  const seq = Number(contentId.replace(/\D/g, '')) || 1;
  return Array.from({ length: 6 }, (_, offset) => {
    const next = seq + offset + 1;
    const topic = MOCK_QUEUE_TOPICS[next % MOCK_QUEUE_TOPICS.length];
    return {
      contentId: `content-${next}`,
      title: `${topic} 이야기 ${next} — 오래 일하는 사람들의 습관`,
      durationSec: 240 + (next % 5) * 30,
      thumbnailUrl: `https://picsum.photos/seed/content-${next}/200`,
    };
  });
};
