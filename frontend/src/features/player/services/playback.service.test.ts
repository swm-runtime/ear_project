/**
 * KAN-124 — 서명 URL 주기 갱신이 음원을 갈아 끼우지 않는지(패치된 빌드), 옛 빌드(runtime 31)에서는
 * 종전 `replace` 로 폴백하는지, 재발행·재생 오류에서만 교체하는지를 본다.
 * 네이티브(expo-audio 패치)는 여기서 돌릴 수 없어 `ExpoAudio` 모듈을 가짜로 끼운다.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AudioIssueResult } from '../player.types';
import { playbackService } from './playback.service';
import { usePlaybackStore } from '../store/playback.store';

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

jest.mock('../api/player.api', () => ({
  issueAudioUrls: (input: { contentId: string; quality?: string | null }) => mockIssue(input),
  // 재생 시작 기록·위치 저장은 이 테스트의 관심 밖이다 — 끝나지 않게 둔다
  startPlay: () => new Promise(() => undefined),
  savePlaybackProgress: () => new Promise(() => undefined),
  sendReplaySignal: () => Promise.resolve(),
  sendSourceLinkClick: () => Promise.resolve(),
}));

jest.mock('@/shared/analytics', () => ({ track: () => undefined }));

jest.mock('@/shared/lib/logger', () => ({
  logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
}));

jest.mock('./player-library.bridge', () => ({ getPlayerLibraryBridge: () => null }));

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
});

afterEach(() => {
  // 싱글턴이다 — 다음 테스트가 앞 세션의 플레이어·타이머를 물려받지 않게 내린다
  playbackService.clearSession();
  jest.useRealTimers();
});

describe('서명 URL 갱신 — 고정 스트림(패치된 빌드)', () => {
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
