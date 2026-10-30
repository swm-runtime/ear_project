/**
 * KAN-124 — 서명 URL 주기 갱신이 음원을 갈아 끼우지 않는지(패치된 빌드), 옛 빌드(runtime 31)에서는
 * 종전 `replace` 로 폴백하는지, 재발행·재생 오류에서만 교체하는지를 본다.
 * 네이티브(expo-audio 패치)는 여기서 돌릴 수 없어 `ExpoAudio` 모듈을 가짜로 끼운다.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState } from 'react-native';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import type { AudioIssueResult } from '../player.types';
import { issueBlockOf, playbackService } from './playback.service';
import { usePlaybackStore } from '../store/playback.store';
import { useSleepTimerStore } from '../store/sleep-timer.store';

type StatusListener = (status: Record<string, unknown>) => void;

interface FakePlayer {
  source: { uri: string };
  replace: jest.Mock<(source: { uri: string }) => void>;
  seekTo: jest.Mock<(sec: number) => Promise<void>>;
  play: jest.Mock<() => void>;
  pause: jest.Mock<() => void>;
  setPlaybackRate: jest.Mock<(rate: number, quality?: string) => void>;
  setActiveForLockScreen: jest.Mock<() => void>;
  clearLockScreenControls: jest.Mock<() => void>;
  remove: jest.Mock<() => void>;
  release: jest.Mock<() => void>;
  addListener: (event: string, listener: StatusListener) => { remove: () => void };
  emit: StatusListener;
  currentTime: number;
  duration: number;
  playing: boolean;
  isBuffering: boolean;
  isLoaded: boolean;
  playbackRate: number;
  volume: number;
}

interface FakeNative {
  setStreamUrl?: jest.Mock<(streamUri: string, url: string) => void>;
  clearStreamUrl?: jest.Mock<(streamUri: string) => void>;
}

const mockNative: { current: FakeNative | null } = { current: null };
const mockPlayers: FakePlayer[] = [];
const mockIssue =
  jest.fn<(input: { contentId: string; quality?: string | null }) => Promise<AudioIssueResult>>();

const mockCreatePlayer = (source: { uri: string }): FakePlayer => {
  let listener: StatusListener | null = null;
  const player: FakePlayer = {
    source,
    replace: jest.fn((next: { uri: string }) => {
      player.source = next;
    }),
    seekTo: jest.fn((sec: number) => {
      player.currentTime = sec;
      return Promise.resolve();
    }),
    play: jest.fn(() => {
      player.playing = true;
    }),
    pause: jest.fn(() => {
      player.playing = false;
    }),
    setPlaybackRate: jest.fn(),
    setActiveForLockScreen: jest.fn(),
    clearLockScreenControls: jest.fn(),
    remove: jest.fn(),
    release: jest.fn(),
    addListener: (_event, next) => {
      listener = next;
      return { remove: () => undefined };
    },
    emit: (status) => listener?.(status),
    currentTime: 0,
    duration: 600,
    playing: false,
    isBuffering: false,
    isLoaded: true,
    playbackRate: 1,
    volume: 1,
  };
  mockPlayers.push(player);
  return player;
};

jest.mock('expo', () => ({
  requireOptionalNativeModule: () => mockNative.current,
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: (source: { uri: string }) => mockCreatePlayer(source),
  setAudioModeAsync: () => Promise.resolve(),
}));

const mockStartPlay = jest.fn((): Promise<unknown> => new Promise(() => undefined));
const mockSaveProgress = jest.fn((): Promise<unknown> => new Promise(() => undefined));
jest.mock('../api/player.api', () => ({
  issueAudioUrls: (input: { contentId: string; quality?: string | null }) => mockIssue(input),
  // 재생 시작 기록·위치 저장은 이 테스트의 관심 밖이다 — 끝나지 않게 둔다
  startPlay: () => mockStartPlay(),
  savePlaybackProgress: () => mockSaveProgress(),
  sendReplaySignal: () => Promise.resolve(),
  sendSourceLinkClick: () => Promise.resolve(),
}));

jest.mock('@/shared/analytics', () => ({ track: () => undefined }));

jest.mock('@/shared/lib/logger', () => ({
  logger: {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
}));

const mockBridge: {
  current: { fetchUpNext: (seed: string, exclude: string[]) => Promise<unknown[]> } | null;
} = {
  current: null,
};
jest.mock('./player-library.bridge', () => ({ getPlayerLibraryBridge: () => mockBridge.current }));

const mockAutoplay = { enabled: false, recommended: true };
jest.mock('@/features/settings', () => ({
  isAutoplayNextEnabled: () => mockAutoplay.enabled,
  isAutoplayRecommendedEnabled: () => mockAutoplay.recommended,
}));

const CONTENT_ID = 'c0ffee00-0000-4000-8000-000000000001';

const issueOf = (url: string, contentVersion = 1): AudioIssueResult => ({
  content: {
    id: CONTENT_ID,
    title: '제목',
    authorName: '저자',
    sourceName: '출처',
    sourceUrl: null,
    durationSec: 600,
    thumbnailUrl: 'https://example.com/t.jpg',
    contentVersion,
  } as AudioIssueResult['content'],
  topicIds: null,
  hasScript: false,
  sections: [],
  libraryItem: null,
  progress: null,
  audio: { url, expiresAt: '2026-10-06T00:05:00Z', expiresInSec: 300, quality: 'lossless' },
});

const loadService = () => ({ service: playbackService, store: usePlaybackStore });

/** 발급 → 플레이어 생성 → 첫 폴링 틱(로드 완료)으로 재생 시작까지 */
const startPlaying = async (service: typeof playbackService): Promise<FakePlayer> => {
  service.start({ contentId: CONTENT_ID, entryPoint: 'library' });
  await jest.advanceTimersByTimeAsync(600);
  const player = mockPlayers[mockPlayers.length - 1];
  expect(player.play).toHaveBeenCalled();
  return player;
};

/** 만료 300초 · 리드 60초 → 240초 뒤 갱신 */
const runUrlRefresh = async (): Promise<void> => {
  await jest.advanceTimersByTimeAsync(240_000);
};

beforeEach(() => {
  jest.useFakeTimers();
  mockPlayers.length = 0;
  mockIssue.mockReset();
  mockNative.current = null;
  mockAutoplay.enabled = false;
  mockAutoplay.recommended = true;
  mockStartPlay.mockReset();
  mockStartPlay.mockImplementation(() => new Promise(() => undefined));
  mockSaveProgress.mockReset();
  mockSaveProgress.mockImplementation(() => new Promise(() => undefined));
});

afterEach(() => {
  // 싱글턴이다 — 다음 테스트가 앞 세션의 플레이어·타이머를 물려받지 않게 내린다
  playbackService.clearSession();
  jest.useRealTimers();
});

describe('플레이어 정리', () => {
  it('세션을 내리면 네이티브 플레이어를 목록에서 빼는 데 그치지 않고 놓는다', async () => {
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    playbackService.clearSession();
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(player.release).toHaveBeenCalledTimes(1);
  });

  it('수면 타이머 페이드 중 편이 바뀌면 놓인 플레이어의 음량을 건드리지 않는다', async () => {
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    usePlaybackStore.getState().patchSession({ isPlaying: true });
    playbackService.fadeOutAndPause(10_000);
    await jest.advanceTimersByTimeAsync(500);
    // 페이드가 실제로 돌고 있다
    expect(player.volume).toBeLessThan(1);
    playbackService.clearSession();
    // 놓인 네이티브 객체는 만지면 던진다 — 페이드 타이머가 건드리면 이 테스트가 터진다
    const volumeAfterTeardown = player.volume;
    const setVolume = jest.fn(() => {
      throw new Error('released');
    });
    Object.defineProperty(player, 'volume', { set: setVolume, get: () => volumeAfterTeardown });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(setVolume).not.toHaveBeenCalled();
  });
});

describe('네이티브 재생 실패', () => {
  it('play 가 던져도(iOS 통화 중 오디오 세션 실패) ▶ 핸들러로 올라가지 않고 재생 안 됨으로 남는다', async () => {
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    playbackService.pause();
    usePlaybackStore.getState().patchSession({ isPlaying: false });
    player.play.mockImplementation(() => {
      throw new Error('Session activation failed');
    });
    expect(() => playbackService.togglePlayPause()).not.toThrow();
    expect(() => playbackService.playWhenReady()).not.toThrow();
    expect(usePlaybackStore.getState().session?.isPlaying).toBe(false);
  });
});

describe('재생 시작 기록 재시도', () => {
  it('실패하면 3초 뒤에 다시 보낸다 — 그 사이 상태 틱이 연달아 보내지 않는다', async () => {
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    mockStartPlay.mockImplementation(() => Promise.reject(new Error('offline')));
    await startPlaying(playbackService);
    // 재생이 시작된 뒤 첫 상태 틱이 처음 보낸다
    await jest.advanceTimersByTimeAsync(500);
    expect(mockStartPlay).toHaveBeenCalledTimes(1);
    // 0.5초 폴링 틱이 여러 번 돌아도(종전엔 틱마다 다시 보냈다) 재시도 전까지는 그대로다
    await jest.advanceTimersByTimeAsync(2_000);
    expect(mockStartPlay).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_500);
    expect(mockStartPlay).toHaveBeenCalledTimes(2);
  });
});

describe('서명 URL 갱신 — 고정 스트림(패치된 빌드)', () => {
  it('네트워크 중단의 수동 재개는 현재 음원을 이어 재생하고 발급·위치를 초기화하지 않는다', async () => {
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    usePlaybackStore
      .getState()
      .patchSession({ banner: 'network', isPlaying: false, positionSec: 120 });
    player.play.mockClear();
    playbackService.playWhenReady();
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.replace).not.toHaveBeenCalled();
    expect(mockIssue).toHaveBeenCalledTimes(1);
    expect(usePlaybackStore.getState().session?.positionSec).toBe(120);
    // 버퍼링 중 playing=true로 보고된 경우도 일시정지로 토글하지 않고 재생을 요청한다.
    usePlaybackStore.getState().patchSession({ isPlaying: true, isBuffering: true });
    playbackService.playWhenReady();
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(player.pause).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    mockNative.current = { setStreamUrl: jest.fn(), clearStreamUrl: jest.fn() };
  });

  it('플레이어에는 고정 스트림 주소를 주고 서명 URL 은 네이티브 표에만 넣는다', async () => {
    mockIssue.mockResolvedValue(issueOf('https://cdn.example.com/a.mp3?sig=1'));
    const { service } = loadService();

    const player = await startPlaying(service);

    expect(player.source.uri).toMatch(/^ear-audio:\/\/c0ffee00-0000-4000-8000-000000000001-\d+$/);
    expect(mockNative.current?.setStreamUrl).toHaveBeenCalledWith(
      player.source.uri,
      'https://cdn.example.com/a.mp3?sig=1',
    );
  });

  it('주기 갱신은 replace 없이 새 서명 URL 만 네이티브에 넘긴다 — 위치·재생 상태를 건드리지 않는다', async () => {
    mockIssue.mockResolvedValueOnce(issueOf('https://cdn.example.com/a.mp3?sig=1'));
    mockIssue.mockResolvedValueOnce(issueOf('https://cdn.example.com/a.mp3?sig=2'));
    const { service } = loadService();
    const player = await startPlaying(service);
    const streamUri = player.source.uri;
    const playCalls = player.play.mock.calls.length;
    const seekCalls = player.seekTo.mock.calls.length;

    await runUrlRefresh();

    expect(mockIssue).toHaveBeenCalledTimes(2);
    expect(mockNative.current?.setStreamUrl).toHaveBeenLastCalledWith(
      streamUri,
      'https://cdn.example.com/a.mp3?sig=2',
    );
    expect(player.replace).not.toHaveBeenCalled();
    expect(player.seekTo).toHaveBeenCalledTimes(seekCalls);
    expect(player.play).toHaveBeenCalledTimes(playCalls);
    expect(player.source.uri).toBe(streamUri);
  });

  it('주기 갱신은 처음 받은 음질을 실어 보낸다 — 그 사이 설정을 바꿔도 이 편은 같은 파일이다(settings.md 4.6)', async () => {
    mockIssue.mockResolvedValue(issueOf('https://cdn.example.com/a.flac?sig=1'));
    const { service } = loadService();
    await startPlaying(service);

    await runUrlRefresh();

    expect(mockIssue).toHaveBeenNthCalledWith(1, { contentId: CONTENT_ID });
    expect(mockIssue).toHaveBeenNthCalledWith(2, { contentId: CONTENT_ID, quality: 'lossless' });
  });

  it('재발행(contentVersion 변경)이면 음원을 교체하고 위치를 0으로 둔다 — 새 고정 주소를 쓰고 옛 주소는 표에서 지운다', async () => {
    mockIssue.mockResolvedValueOnce(issueOf('https://cdn.example.com/a.mp3?sig=1', 1));
    mockIssue.mockResolvedValueOnce(issueOf('https://cdn.example.com/b.mp3?sig=2', 2));
    const { service, store } = loadService();
    const player = await startPlaying(service);
    const oldStreamUri = player.source.uri;
    player.currentTime = 120;
    await jest.advanceTimersByTimeAsync(600);

    await runUrlRefresh();

    expect(player.replace).toHaveBeenCalledTimes(1);
    const newStreamUri = player.replace.mock.calls[0][0].uri;
    expect(newStreamUri).toMatch(/^ear-audio:\/\//);
    expect(newStreamUri).not.toBe(oldStreamUri);
    expect(mockNative.current?.setStreamUrl).toHaveBeenLastCalledWith(
      newStreamUri,
      'https://cdn.example.com/b.mp3?sig=2',
    );
    expect(mockNative.current?.clearStreamUrl).toHaveBeenCalledWith(oldStreamUri);
    expect(player.seekTo).toHaveBeenLastCalledWith(0);
    expect(store.getState().session?.positionSec).toBe(0);
  });

  it('재생 중 네이티브 오류면 일시정지 + 재시도 배너, [다시 시도]가 음원을 다시 세우고 이어 재생한다', async () => {
    mockIssue.mockResolvedValueOnce(issueOf('https://cdn.example.com/a.mp3?sig=1'));
    mockIssue.mockResolvedValueOnce(issueOf('https://cdn.example.com/a.mp3?sig=2'));
    const { service, store } = loadService();
    const player = await startPlaying(service);
    player.currentTime = 90;
    await jest.advanceTimersByTimeAsync(600);

    player.emit({ ...player, error: 'ear-audio: HTTP 403', playing: false });
    await jest.advanceTimersByTimeAsync(0);

    expect(player.pause).toHaveBeenCalled();
    expect(store.getState().session?.banner).toBe('refresh_failed');

    const playCalls = player.play.mock.calls.length;
    service.retryUrlRefresh();
    await jest.advanceTimersByTimeAsync(0);

    expect(player.replace).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenLastCalledWith(90);
    expect(player.play.mock.calls.length).toBe(playCalls + 1);
    expect(store.getState().session?.banner).toBeNull();
  });
});

describe('서명 URL 갱신 — 옛 빌드 폴백(runtime 31, 네이티브 표 없음)', () => {
  it('ExpoAudio 에 setStreamUrl 이 없으면 서명 URL 을 직접 주고 갱신 때 replace 한다', async () => {
    // 옛 빌드의 ExpoAudio — 모듈은 있지만 패치 함수가 없다
    mockNative.current = {};
    mockIssue.mockResolvedValueOnce(issueOf('https://cdn.example.com/a.mp3?sig=1'));
    mockIssue.mockResolvedValueOnce(issueOf('https://cdn.example.com/a.mp3?sig=2'));
    const { service } = loadService();
    const player = await startPlaying(service);
    expect(player.source.uri).toBe('https://cdn.example.com/a.mp3?sig=1');
    player.currentTime = 200;
    await jest.advanceTimersByTimeAsync(600);
    const playCalls = player.play.mock.calls.length;

    await runUrlRefresh();

    expect(player.replace).toHaveBeenCalledWith({ uri: 'https://cdn.example.com/a.mp3?sig=2' });
    expect(player.seekTo).toHaveBeenLastCalledWith(200);
    // 재생 중이었으므로 교체 뒤 이어 재생한다(종전 동작)
    expect(player.play.mock.calls.length).toBe(playCalls + 1);
  });

  it('ExpoAudio 모듈 자체가 없어도(웹·Expo Go) 서명 URL 로 재생하고 replace 로 갱신한다', async () => {
    mockNative.current = null;
    mockIssue.mockResolvedValueOnce(issueOf('https://cdn.example.com/a.mp3?sig=1'));
    mockIssue.mockResolvedValueOnce(issueOf('https://cdn.example.com/a.mp3?sig=2'));
    const { service } = loadService();
    const player = await startPlaying(service);
    expect(player.source.uri).toBe('https://cdn.example.com/a.mp3?sig=1');

    await runUrlRefresh();

    expect(player.replace).toHaveBeenCalledWith({ uri: 'https://cdn.example.com/a.mp3?sig=2' });
  });
});

describe('백그라운드 재생 — 위치만 바뀐 틱은 화면에 올리지 않는다(EAR-APP-H)', () => {
  let appState = 'active';

  beforeEach(() => {
    appState = 'active';
    Object.defineProperty(AppState, 'currentState', { get: () => appState, configurable: true });
  });

  it('백그라운드에서는 스토어 위치가 그대로이고, ±10초는 실제 위치를 기준으로 하며, 돌아오면 다시 올린다', async () => {
    // given — 재생 중, 화면에 30초가 올라가 있다
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    player.currentTime = 30;
    await jest.advanceTimersByTimeAsync(600);
    expect(usePlaybackStore.getState().session?.positionSec).toBe(30);

    // when — 앱이 내려간 채로 재생이 90초까지 간다
    appState = 'background';
    const sessionBefore = usePlaybackStore.getState().session;
    player.currentTime = 90;
    await jest.advanceTimersByTimeAsync(2_000);

    // then — 스토어(화면)는 그대로다(다시 그리지 않는다)
    expect(usePlaybackStore.getState().session).toBe(sessionBefore);

    // when — 앱으로 돌아온 뒤 첫 틱
    appState = 'active';
    player.currentTime = 95;
    await jest.advanceTimersByTimeAsync(600);

    // then — 다시 위치가 올라간다
    expect(usePlaybackStore.getState().session?.positionSec).toBe(95);

    // when — 다시 내려가 150초까지 간 뒤 잠금화면 [10초 앞으로]
    appState = 'background';
    player.currentTime = 150;
    await jest.advanceTimersByTimeAsync(600);
    playbackService.seekForward();

    // then — 화면에 남은 95초가 아니라 실제 위치 150초에서 10초 앞
    expect(player.seekTo).toHaveBeenLastCalledWith(160);
  });
});

describe('±10초 연타 — 네이티브 시크는 한 번에 하나(PM 2026-10-24 iOS 벽돌)', () => {
  beforeEach(() => {
    Object.defineProperty(AppState, 'currentState', { get: () => 'active', configurable: true });
  });

  it('도는 시크가 끝나기 전 탭은 쌓지 않고, 끝나면 마지막 목표로 한 번만 더 보낸다', async () => {
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    // 첫 로드 틱은 시작 위치 맞추기(setup)가 먹는다 — 두 번째 틱부터 위치가 올라간다
    player.emit({ currentTime: 0, duration: 600, playing: true, isLoaded: true });
    await jest.advanceTimersByTimeAsync(0);
    player.currentTime = 100;
    player.emit({ currentTime: 100, duration: 600, playing: true, isLoaded: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(usePlaybackStore.getState().session?.positionSec).toBe(100);
    let finishSeek: () => void = () => undefined;
    player.seekTo.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSeek = resolve;
        }),
    );
    const before = player.seekTo.mock.calls.length;

    playbackService.seekBackward();
    playbackService.seekBackward();
    playbackService.seekBackward();

    // 화면 위치는 탭마다 바로 간다 — 네이티브엔 첫 시크만
    expect(usePlaybackStore.getState().session?.positionSec).toBe(70);
    expect(player.seekTo.mock.calls.slice(before)).toEqual([[90]]);

    finishSeek();
    await jest.advanceTimersByTimeAsync(0);
    expect(player.seekTo.mock.calls.slice(before)).toEqual([[90], [70]]);
  });

  it('네이티브가 끝을 알리지 않아도 시간이 지나면 다음 시크를 보낸다', async () => {
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    // 첫 로드 틱은 시작 위치 맞추기(setup)가 먹는다 — 두 번째 틱부터 위치가 올라간다
    player.emit({ currentTime: 0, duration: 600, playing: true, isLoaded: true });
    await jest.advanceTimersByTimeAsync(0);
    player.currentTime = 100;
    player.emit({ currentTime: 100, duration: 600, playing: true, isLoaded: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(usePlaybackStore.getState().session?.positionSec).toBe(100);
    player.seekTo.mockImplementation(() => new Promise<void>(() => undefined));
    const before = player.seekTo.mock.calls.length;

    playbackService.seekBackward();
    await jest.advanceTimersByTimeAsync(2_100);
    playbackService.seekBackward();

    expect(player.seekTo.mock.calls.slice(before)).toEqual([[90], [80]]);
  });
});

describe('재생 목록 자동 재생(연속 재생 — player.md 4.2-4)', () => {
  const NEXT_ID = 'c0ffee00-0000-4000-8000-000000000002';
  const entryOf = (contentId: string, isCompleted = false) => ({
    itemId: null,
    contentId,
    title: contentId,
    authorName: null,
    sourceName: null,
    thumbnailUrl: null,
    durationSec: 600,
    isCountedToday: false,
    isCompleted,
    topicIds: [],
  });

  /** 탐색 맥락 [지금 편, 다음 편](또는 주어진 목록)으로 재생하다가 끝까지 간다 */
  const playToEnd = async (items = [entryOf(CONTENT_ID), entryOf(NEXT_ID)]): Promise<void> => {
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    usePlaybackStore.getState().setQueueContext({
      kind: 'explore',
      source: { type: 'search', query: '커리어' },
      items,
    });
    player.currentTime = 600;
    player.playing = false;
    player.emit({
      didJustFinish: true,
      currentTime: 600,
      duration: 600,
      playing: false,
      isLoaded: true,
    });
    await jest.advanceTimersByTimeAsync(600);
  };

  afterEach(() => {
    useSleepTimerStore.getState().set(null, null);
    mockBridge.current = null;
  });

  it('켜져 있고 목록이 끝났으면 추천 편들로 만든 새 재생 목록으로 갈아타 첫 안 들은 편을 튼다', async () => {
    mockAutoplay.enabled = true;
    const DONE_ID = 'c0ffee00-0000-4000-8000-000000000003';
    const LATER_ID = 'c0ffee00-0000-4000-8000-000000000004';
    const fetchUpNext = jest.fn(async (_seed: string, _exclude: string[]) => [
      entryOf(DONE_ID, true),
      entryOf(NEXT_ID),
      entryOf(LATER_ID),
    ]);
    mockBridge.current = { fetchUpNext };
    await playToEnd([entryOf(CONTENT_ID)]);
    expect(fetchUpNext).toHaveBeenCalledWith(CONTENT_ID, [CONTENT_ID]);
    expect(mockIssue.mock.calls.map(([input]) => input.contentId)).toEqual([CONTENT_ID, NEXT_ID]);
    const context = usePlaybackStore.getState().queueContext;
    expect(context.kind === 'explore' ? context.source : null).toEqual({ type: 'recommended' });
    // 옛 목록은 남지 않는다 — 다 들은 추천 편도 뺀다
    expect(context.kind === 'explore' ? context.items.map((item) => item.contentId) : []).toEqual([
      NEXT_ID,
      LATER_ID,
    ]);
  });

  it('추천 이어 틀기(플레이어 칩)가 꺼져 있으면 목록 끝에서 멈추고 추천을 받지 않는다', async () => {
    mockAutoplay.enabled = true;
    mockAutoplay.recommended = false;
    const fetchUpNext = jest.fn(async () => [entryOf(NEXT_ID)]);
    mockBridge.current = { fetchUpNext };
    await playToEnd([entryOf(CONTENT_ID)]);
    expect(fetchUpNext).not.toHaveBeenCalled();
    expect(mockIssue.mock.calls.map(([input]) => input.contentId)).toEqual([CONTENT_ID]);
  });

  it('다음 줄이 다 들은 편이어도 건너뛰지 않고 그 편을 튼다(PM 2026-10-24)', async () => {
    mockAutoplay.enabled = true;
    await playToEnd([entryOf(CONTENT_ID), entryOf(NEXT_ID, true)]);
    expect(mockIssue.mock.calls.map(([input]) => input.contentId)).toEqual([CONTENT_ID, NEXT_ID]);
  });

  it('추천도 비었으면 끝난 자리에 멈춘다', async () => {
    mockAutoplay.enabled = true;
    mockBridge.current = { fetchUpNext: jest.fn(async () => []) };
    await playToEnd([entryOf(CONTENT_ID)]);
    expect(mockIssue.mock.calls.map(([input]) => input.contentId)).toEqual([CONTENT_ID]);
  });

  it('꺼져 있으면(기본) 끝난 자리에 멈춘다', async () => {
    await playToEnd();
    expect(mockIssue.mock.calls.map(([input]) => input.contentId)).toEqual([CONTENT_ID]);
    expect(usePlaybackStore.getState().session?.state).toBe('ended');
  });

  it('켜져 있으면 확인 없이 재생 목록의 다음 편을 튼다 — 맥락은 그대로', async () => {
    mockAutoplay.enabled = true;
    await playToEnd();
    expect(mockIssue.mock.calls.map(([input]) => input.contentId)).toEqual([CONTENT_ID, NEXT_ID]);
    expect(usePlaybackStore.getState().session?.contentId).toBe(NEXT_ID);
    expect(usePlaybackStore.getState().queueContext.kind).toBe('explore');
  });

  it('수면 타이머 "이 에피소드 종료 시"면 켜져 있어도 넘어가지 않는다', async () => {
    mockAutoplay.enabled = true;
    useSleepTimerStore.getState().set({ kind: 'endOfEpisode' }, null);
    await playToEnd();
    expect(mockIssue.mock.calls.map(([input]) => input.contentId)).toEqual([CONTENT_ID]);
  });
});

describe('담지 않은 편의 완청 통지(KAN-252)', () => {
  it('진행 저장의 is_completed 가 처음 true 가 되면 재조회 신호를 한 번 낸다 — library_item 이 null 이어도', async () => {
    // given — 담지 않은 편(library_item null)을 끝까지 들었고 서버가 완청이라고 답한다
    const onServerStateChanged = jest.fn();
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    // 재생 시작 기록이 끝나야 위치 저장이 돈다(player-api.md 4.3)
    mockStartPlay.mockImplementation(() =>
      Promise.resolve({
        libraryItem: null,
        playLimit: { dailyPlayLimit: null, dailyPlayCount: null, serviceDate: '2026-10-23' },
      }),
    );
    mockSaveProgress.mockImplementation(() =>
      Promise.resolve({
        positionSec: 600,
        maxReachedSec: 600,
        contentVersion: 1,
        contentStatus: 'published',
        libraryItem: null,
        isCompleted: true,
      }),
    );
    playbackService.start({
      contentId: CONTENT_ID,
      entryPoint: 'explore',
      callbacks: { onServerStateChanged },
    });
    await jest.advanceTimersByTimeAsync(600);
    const player = mockPlayers[mockPlayers.length - 1];
    // 재생 시작 기록 성공도 재조회 신호를 낸다 — 그 뒤부터 센다
    player.playing = true;
    player.emit({
      didJustFinish: false,
      currentTime: 1,
      duration: 600,
      playing: true,
      isLoaded: true,
    });
    await jest.advanceTimersByTimeAsync(100);
    const afterStart = onServerStateChanged.mock.calls.length;

    // when — 끝까지 재생(종료 저장) 뒤 저장이 몇 번 더 돌아도
    player.currentTime = 600;
    player.playing = false;
    player.emit({
      didJustFinish: true,
      currentTime: 600,
      duration: 600,
      playing: false,
      isLoaded: true,
    });
    await jest.advanceTimersByTimeAsync(20_000);

    // then
    expect(onServerStateChanged.mock.calls.length - afterStart).toBe(1);
  });
});

describe('듣던 편을 지키는 시작(KAN-257 — keepCurrentUntilIssued)', () => {
  const OTHER_ID = 'c0ffee00-0000-4000-8000-000000000009';
  const limitError = () =>
    new ApiError(
      ERROR_CODES.PLAY_LIMIT_EXCEEDED,
      '오늘 청취 한도를 모두 사용했어요',
      false,
      null,
      null,
      403,
    );

  it('발급이 한도 403 이면 듣던 세션·음원을 그대로 두고 onIssueBlocked 만 부른다', async () => {
    // given — 한 편을 듣는 중
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    const onIssueBlocked = jest.fn();
    const onBecameCurrent = jest.fn();
    mockIssue.mockRejectedValueOnce(limitError());

    // when — 다른 편을 듣던 편을 지키며 시작한다
    playbackService.start({
      contentId: OTHER_ID,
      entryPoint: 'explore',
      autoplay: false,
      keepCurrentUntilIssued: true,
      callbacks: { onIssueBlocked, onBecameCurrent },
    });
    await jest.advanceTimersByTimeAsync(0);

    // then
    expect(onIssueBlocked).toHaveBeenCalledWith({
      kind: 'paywall',
      message: '오늘 청취 한도를 모두 사용했어요',
    });
    expect(onBecameCurrent).not.toHaveBeenCalled();
    expect(usePlaybackStore.getState().session?.contentId).toBe(CONTENT_ID);
    expect(usePlaybackStore.getState().session?.state).toBe('ready');
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.remove).not.toHaveBeenCalled();
  });

  it('허용이면 발급이 끝난 뒤에 갈아 끼운다 — 그 전까지는 듣던 편이 세션이다', async () => {
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    let resolveIssue: (value: AudioIssueResult) => void = () => undefined;
    mockIssue.mockImplementationOnce(
      () =>
        new Promise<AudioIssueResult>((resolve) => {
          resolveIssue = resolve;
        }),
    );
    const onBecameCurrent = jest.fn();
    const onIssued = jest.fn();

    playbackService.start({
      contentId: OTHER_ID,
      entryPoint: 'explore',
      autoplay: false,
      keepCurrentUntilIssued: true,
      callbacks: { onBecameCurrent, onIssued },
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(usePlaybackStore.getState().session?.contentId).toBe(CONTENT_ID);
    expect(onBecameCurrent).not.toHaveBeenCalled();

    resolveIssue(issueOf('https://example.com/other'));
    await jest.advanceTimersByTimeAsync(0);
    expect(onBecameCurrent).toHaveBeenCalledTimes(1);
    expect(onIssued).toHaveBeenCalledWith({ isReusedSession: false });
    expect(usePlaybackStore.getState().session?.contentId).toBe(OTHER_ID);
    expect(player.remove).toHaveBeenCalled();
  });

  it('기다리는 사이 다른 재생이 시작되면 늦게 온 발급 결과는 버린다', async () => {
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    await startPlaying(playbackService);
    let rejectIssue: (error: unknown) => void = () => undefined;
    mockIssue.mockImplementationOnce(
      () =>
        new Promise<AudioIssueResult>((_resolve, reject) => {
          rejectIssue = reject;
        }),
    );
    const onIssueBlocked = jest.fn();
    playbackService.start({
      contentId: OTHER_ID,
      entryPoint: 'explore',
      autoplay: false,
      keepCurrentUntilIssued: true,
      callbacks: { onIssueBlocked },
    });
    // 그 사이 다른 편을 바로 튼다(종전 경로)
    const THIRD_ID = 'c0ffee00-0000-4000-8000-00000000000a';
    playbackService.start({ contentId: THIRD_ID, entryPoint: 'library' });
    await jest.advanceTimersByTimeAsync(600);

    rejectIssue(limitError());
    await jest.advanceTimersByTimeAsync(0);
    expect(onIssueBlocked).not.toHaveBeenCalled();
    expect(usePlaybackStore.getState().session?.contentId).toBe(THIRD_ID);
  });

  it('듣던 세션이 없으면 종전대로 세션을 내리고 onIssueBlocked 를 부른다', async () => {
    const onIssueBlocked = jest.fn();
    mockIssue.mockRejectedValueOnce(limitError());
    playbackService.start({
      contentId: OTHER_ID,
      entryPoint: 'library',
      autoplay: false,
      keepCurrentUntilIssued: true,
      callbacks: { onIssueBlocked },
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(onIssueBlocked).toHaveBeenCalledTimes(1);
    expect(usePlaybackStore.getState().session).toBeNull();
  });
});

describe('시리즈 잠긴 편(KAN-294 — SERIES_EPISODE_LOCKED, experiments-api.md 4.2-3)', () => {
  const LOCKED_ID = 'c0ffee00-0000-4000-8000-00000000000b';
  const lockedError = () =>
    new ApiError(
      ERROR_CODES.SERIES_EPISODE_LOCKED,
      '이 편은 프로 구독에서 들을 수 있어요',
      false,
      null,
      null,
      403,
    );
  const entryOf = (contentId: string, isLocked?: boolean) => ({
    itemId: null,
    contentId,
    title: contentId,
    authorName: null,
    sourceName: null,
    thumbnailUrl: null,
    durationSec: 600,
    isCountedToday: false,
    isCompleted: false,
    topicIds: [],
    ...(isLocked === undefined ? {} : { isLocked }),
  });

  /** 탐색 맥락 목록으로 재생하다가 끝까지 간다(자동 재생 켬) */
  const playToEnd = async (items: ReturnType<typeof entryOf>[]): Promise<void> => {
    mockAutoplay.enabled = true;
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    usePlaybackStore.getState().setQueueContext({
      kind: 'explore',
      source: { type: 'series', title: '시리즈' },
      items,
    });
    player.currentTime = 600;
    player.playing = false;
    player.emit({
      didJustFinish: true,
      currentTime: 600,
      duration: 600,
      playing: false,
      isLoaded: true,
    });
    await jest.advanceTimersByTimeAsync(600);
  };

  afterEach(() => {
    mockBridge.current = null;
  });

  it('잠금 403 은 series_locked 로, 한도 403 은 종전 갈래로 읽고 그 밖의 에러는 차단이 아니다', () => {
    // given
    const reached = new ApiError(ERROR_CODES.PLAY_LIMIT_REACHED, '한도', false, null, null, 403);
    const withdrawn = new ApiError(ERROR_CODES.CONTENT_WITHDRAWN, '회수', false, null, null, 403);

    // when · then
    expect(issueBlockOf(lockedError())).toEqual({
      kind: 'series_locked',
      message: '이 편은 프로 구독에서 들을 수 있어요',
    });
    expect(issueBlockOf(reached)).toEqual({ kind: 'paid_limit', message: '한도' });
    expect(issueBlockOf(withdrawn)).toBeNull();
    expect(issueBlockOf(new Error('x'))).toBeNull();
  });

  it('발급이 잠금 403 이면 세션을 series_locked 로 막는다 — 로드 실패 화면이 아니다', async () => {
    // given
    mockIssue.mockRejectedValueOnce(lockedError());

    // when
    playbackService.start({ contentId: LOCKED_ID, entryPoint: 'explore' });
    await jest.advanceTimersByTimeAsync(0);

    // then
    const session = usePlaybackStore.getState().session;
    expect(session?.state).toBe('blocked');
    expect(session?.blocked).toEqual({
      kind: 'series_locked',
      message: '이 편은 프로 구독에서 들을 수 있어요',
    });
    expect(mockPlayers).toHaveLength(0);
  });

  it('듣던 편을 지키는 시작에서 잠금 403 이면 듣던 편을 그대로 두고 onIssueBlocked 에 series_locked 를 넘긴다', async () => {
    // given — 한 편을 듣는 중
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));
    const player = await startPlaying(playbackService);
    const onIssueBlocked = jest.fn();
    mockIssue.mockRejectedValueOnce(lockedError());

    // when
    playbackService.start({
      contentId: LOCKED_ID,
      entryPoint: 'explore',
      autoplay: false,
      keepCurrentUntilIssued: true,
      callbacks: { onIssueBlocked },
    });
    await jest.advanceTimersByTimeAsync(0);

    // then
    expect(onIssueBlocked).toHaveBeenCalledWith({
      kind: 'series_locked',
      message: '이 편은 프로 구독에서 들을 수 있어요',
    });
    expect(usePlaybackStore.getState().session?.contentId).toBe(CONTENT_ID);
    expect(player.pause).not.toHaveBeenCalled();
  });

  it('재생 시작 기록(POST /play)이 잠금 403 이면 멈추고 series_locked 로 막는다 — 재시도하지 않는다', async () => {
    // given
    mockStartPlay.mockImplementation(() => Promise.reject(lockedError()));
    mockIssue.mockResolvedValue(issueOf('https://example.com/audio'));

    // when
    const player = await startPlaying(playbackService);
    await jest.advanceTimersByTimeAsync(5_000);

    // then
    expect(usePlaybackStore.getState().session?.blocked?.kind).toBe('series_locked');
    expect(player.pause).toHaveBeenCalled();
    expect(mockStartPlay).toHaveBeenCalledTimes(1);
  });

  it('자동 재생의 다음 줄이 잠긴 편이면 넘어가지 않고 끝난 자리에 멈춘다 — 잠금 시트를 띄울 기록을 남긴다(KAN-302)', async () => {
    // when
    await playToEnd([entryOf(CONTENT_ID), entryOf(LOCKED_ID, true)]);

    // then
    expect(mockIssue.mock.calls.map(([input]) => input.contentId)).toEqual([CONTENT_ID]);
    expect(usePlaybackStore.getState().session?.state).toBe('ended');
    const pending = usePlaybackStore.getState().lockedNext;
    expect(pending?.afterContentId).toBe(CONTENT_ID);
    expect(pending?.entry.contentId).toBe(LOCKED_ID);
    expect(pending?.queue.kind).toBe('explore');
  });

  it('잠긴 편 앞에서 멈춘 뒤 다른 편을 틀면 그 기록을 지운다(KAN-302)', async () => {
    // given
    await playToEnd([entryOf(CONTENT_ID), entryOf(LOCKED_ID, true)]);

    // when
    playbackService.start({
      contentId: 'c0ffee00-0000-4000-8000-00000000000d',
      entryPoint: 'explore',
    });

    // then
    expect(usePlaybackStore.getState().lockedNext).toBeNull();
  });

  it('잠금 필드가 없거나 false 면(옛 서버) 종전처럼 다음 편을 튼다', async () => {
    // when
    await playToEnd([entryOf(CONTENT_ID), entryOf(LOCKED_ID)]);

    // then
    expect(mockIssue.mock.calls.map(([input]) => input.contentId)).toEqual([CONTENT_ID, LOCKED_ID]);
  });

  it('목록이 끝나 추천으로 갈아탈 때 잠긴 추천 편은 빼고 잠기지 않은 첫 편을 튼다', async () => {
    // given
    const OPEN_ID = 'c0ffee00-0000-4000-8000-00000000000c';
    mockBridge.current = {
      fetchUpNext: jest.fn(async () => [entryOf(LOCKED_ID, true), entryOf(OPEN_ID, false)]),
    };

    // when
    await playToEnd([entryOf(CONTENT_ID)]);

    // then
    expect(mockIssue.mock.calls.map(([input]) => input.contentId)).toEqual([CONTENT_ID, OPEN_ID]);
    const context = usePlaybackStore.getState().queueContext;
    expect(context.kind === 'explore' ? context.items.map((item) => item.contentId) : []).toEqual([
      OPEN_ID,
    ]);
  });
});
