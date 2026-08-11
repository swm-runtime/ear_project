/**
 * PlaybackService(architecture.md 5.1) — expo-audio를 감싸는 유일한 재생 제어 지점.
 * 화면·미니플레이어·잠금화면 컨트롤이 전부 이 서비스로 명령을 보내고, 상태는
 * playback.store로만 노출한다. React 트리 밖 싱글턴이라 화면이 언마운트돼도 재생이 유지된다.
 *
 * 시점 규칙(명세 소유자):
 * - 차감·재생 시작 기록은 오디오가 실제로 소리를 낸 시점(paywall.md 4.3 · player-api.md 4.2)
 * - 위치 저장은 5초 주기/일시정지/화면 이탈/백그라운드/재생 종료(player.md 4.3)
 * - 완청 판정은 서버만 한다 — 클라이언트는 max_reached_sec을 보낼 뿐이다(player.md 4.4)
 */
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { AppState, type NativeEventSubscription } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { generateId } from '@/shared/lib/generate-id';
import { logger } from '@/shared/lib/logger';

import {
  issueAudioUrls,
  savePlaybackProgress,
  sendReplaySignal,
  sendSourceLinkClick,
  startPlay,
} from '../api/player.api';
import {
  AUDIO_URL_REFRESH_LEAD_SEC,
  PLAYBACK_PROGRESS_SYNC_INTERVAL_MS,
  PLAYBACK_STATUS_UPDATE_INTERVAL_MS,
  SEEK_STEP_SEC,
} from '../player.constants';
import type {
  PlaybackSession,
  PlayEntryPoint,
  PlaybackStartMeta,
  PlayStartResult,
} from '../player.types';
import {
  commitListenedDelta,
  createTrackingState,
  markSeek,
  observePosition,
  peekListenedDelta,
  type PlaybackTrackingState,
} from './playback-tracking';
import { getPlayerLibraryBridge } from './player-library.bridge';
import { usePlayLimitStore } from '../store/play-limit.store';
import { usePlaybackStore } from '../store/playback.store';

/** 재생 시작 기록 실패(네트워크) 후 재시도까지의 간격 — TODO(offline-queue): 큐 도입 시 대체 */
const PLAY_REPORT_RETRY_DELAY_MS = 3_000;
/** 서명 URL 갱신 실패 후 자동 재시도 간격(player-api.md 4.1 — 버퍼가 이어지는 동안 재시도) */
const URL_REFRESH_RETRY_DELAY_MS = 15_000;
/** 끝 도달 판정 여유 — 상태 이벤트 주기 안에서 duration 직전 값이 마지막 관측일 수 있다 */
const PLAYBACK_END_EPSILON_SEC = 0.3;

/** 이벤트(AudioStatus)와 속성 폴링이 공유하는 관측 형태 — 트래킹이 실제로 쓰는 필드만 */
type PlaybackStatusSnapshot = Pick<
  AudioStatus,
  | 'currentTime'
  | 'duration'
  | 'playing'
  | 'didJustFinish'
  | 'isBuffering'
  | 'isLoaded'
  | 'playbackRate'
>;

export interface PlaybackCallbacks {
  /** 재생이 실제로 시작된 직후(200) — 탐색의 라이브러리 자동 적립 같은 진입점 후속 처리용 */
  onPlayStarted?: (result: PlayStartResult) => void;
  /** 재생 성공·회수·완청 전이 등 서버 상태 변화 — 진입점 화면이 자기 목록을 재조회한다 */
  onServerStateChanged?: () => void;
  /** CONTENT_WITHDRAWN(403) — 진입점별 정리(목록 제거·미니플레이어 내림) */
  onWithdrawn?: () => void;
}

export interface StartPlaybackRequest {
  contentId: string;
  entryPoint: PlayEntryPoint;
  /** 기본 true. 미니플레이어 복원 확대·푸시 딥링크 진입은 false(player.md 3장 — FR-24) */
  autoplay?: boolean;
  /** 완료 화면 ▶ 재청취 — 위치 0부터 재생하고 replay 신호를 기록한다(player.md 5장) */
  restartFromBeginning?: boolean;
  /** 목록에서 이미 들고 온 메타 — 진입과 동시에 그린다(player-uiux.md 4.3) */
  meta?: PlaybackStartMeta;
  callbacks?: PlaybackCallbacks;
}

interface SessionContext {
  request: StartPlaybackRequest;
  contentId: string;
  entryPoint: PlayEntryPoint;
  callbacks: PlaybackCallbacks;
  contentVersion: number;
  /** 서버가 내려준 길이. 0이면 미상 — 완청은 폴백 경로(library-api.md 4.5)다 */
  durationSec: number;
  libraryItemId: string | null;
  tracking: PlaybackTrackingState;
  hasReportedPlayStart: boolean;
  isReportingPlayStart: boolean;
  /** 완료 상태 ▶로 시작한 재생 — 시작 기록과 함께 replay 신호를 보낸다(player-api.md 4.4) */
  isReplay: boolean;
  replayIdempotencyKey: string | null;
  isSaving: boolean;
  isEnded: boolean;
  isRefreshingUrl: boolean;
}

const store = usePlaybackStore;

const initialSession = (request: StartPlaybackRequest): PlaybackSession => ({
  contentId: request.contentId,
  entryPoint: request.entryPoint,
  state: 'loading',
  blocked: null,
  meta: {
    title: request.meta?.title ?? null,
    authorName: request.meta?.authorName ?? null,
    sourceName: request.meta?.sourceName ?? null,
    sourceUrl: null,
    thumbnailUrl: request.meta?.thumbnailUrl ?? null,
    contentVersion: null,
  },
  libraryItem: null,
  isPlaying: false,
  isBuffering: false,
  positionSec: 0,
  durationSec: request.meta?.durationSec ?? 0,
  banner: null,
});

class PlaybackService {
  private player: AudioPlayer | null = null;
  private statusSubscription: { remove: () => void } | null = null;
  private ctx: SessionContext | null = null;
  /** start 경합·teardown 이후 도착하는 비동기 완료를 무시하기 위한 세대 토큰 */
  private generation = 0;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private uiTickTimer: ReturnType<typeof setInterval> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private playReportRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private isAudioModeConfigured = false;
  private pendingSetup: { startPositionSec: number; autoplay: boolean } | null = null;

  /* ── 시작 ── */

  start(request: StartPlaybackRequest): void {
    const session = store.getState().session;
    const isSameContent =
      this.ctx !== null && session !== null && session.contentId === request.contentId;
    const isReusableState =
      session !== null && (session.state === 'ready' || session.state === 'ended');

    if (isSameContent && isReusableState) {
      // 같은 콘텐츠의 살아 있는 세션 — 발급을 반복하지 않는다. 최신 진입 맥락만 넘겨받는다
      this.ctx = {
        ...this.ctx!,
        request,
        entryPoint: request.entryPoint,
        callbacks: request.callbacks ?? {},
      };
      if (request.restartFromBeginning) {
        void this.restartFromBeginning();
        return;
      }
      if ((request.autoplay ?? true) && session.state === 'ready' && !session.isPlaying) {
        this.player?.play();
      }
      return;
    }

    void this.startFresh(request);
  }

  private async startFresh(request: StartPlaybackRequest): Promise<void> {
    // 이전 세션의 미저장분을 흘리지 않는다 — 값 캡처 후 정리(응답은 기다리지 않는다)
    this.flushProgress('switch');
    this.teardownPlayer();

    const generation = ++this.generation;
    this.ctx = {
      request,
      contentId: request.contentId,
      entryPoint: request.entryPoint,
      callbacks: request.callbacks ?? {},
      contentVersion: 1,
      durationSec: request.meta?.durationSec ?? 0,
      libraryItemId: null,
      tracking: createTrackingState(0),
      hasReportedPlayStart: false,
      isReportingPlayStart: false,
      isReplay: request.restartFromBeginning === true,
      replayIdempotencyKey: null,
      isSaving: false,
      isEnded: false,
      isRefreshingUrl: false,
    };
    store.setState({ session: initialSession(request), isMiniPlayerDismissed: false });

    this.ensureAudioMode();
    this.ensureAppStateListener();
    this.ensureSyncTimer();

    try {
      const issue = await issueAudioUrls({ contentId: request.contentId });
      if (generation !== this.generation || !this.ctx) return;

      this.ctx.contentVersion = issue.content.contentVersion;
      this.ctx.durationSec = issue.content.durationSec;
      this.ctx.libraryItemId = issue.libraryItem?.id ?? null;

      let startPositionSec = request.restartFromBeginning ? 0 : (issue.progress?.positionSec ?? 0);
      // 재발행으로 길이가 줄어 위치가 길이를 넘으면 0부터 재생한다(player.md 7)
      if (issue.content.durationSec > 0 && startPositionSec >= issue.content.durationSec) {
        startPositionSec = 0;
      }
      this.ctx.tracking = createTrackingState(issue.progress?.maxReachedSec ?? 0);

      store.getState().patchSession({
        meta: {
          title: issue.content.title,
          authorName: issue.content.authorName,
          sourceName: issue.content.sourceName,
          sourceUrl: issue.content.sourceUrl,
          thumbnailUrl: issue.content.thumbnailUrl,
          contentVersion: issue.content.contentVersion,
        },
        libraryItem: issue.libraryItem,
        durationSec: issue.content.durationSec,
        positionSec: startPositionSec,
      });

      this.createPlayer(issue.audio.url, startPositionSec, request.autoplay ?? true, generation);
      this.scheduleUrlRefresh(issue.audio.expiresInSec);
    } catch (error) {
      if (generation !== this.generation) return;
      this.handleIssueError(error);
    }
  }

  /** PL8 [다시 시도] — 발급부터 다시. 이 시점에는 차감되지 않았다(paywall.md 4.3) */
  retryLoad(): void {
    if (!this.ctx) return;
    void this.startFresh(this.ctx.request);
  }

  /** 발급(audio-urls) 실패 분기 — 에러 코드로만 가른다(convention.md 5.3) */
  private handleIssueError(error: unknown): void {
    if (isApiError(error)) {
      switch (error.errorCode) {
        case ERROR_CODES.PLAY_LIMIT_EXCEEDED:
          // 발급 시점의 한도 403은 경합·딥링크에서만 난다 — 화면이 닫고 페이월로 전환(player-api.md 5장)
          this.markBlocked('paywall', error.message);
          return;
        case ERROR_CODES.PLAY_LIMIT_REACHED:
          this.markBlocked('paid_limit', error.message);
          return;
        case ERROR_CODES.CONTENT_WITHDRAWN:
          this.markWithdrawn();
          return;
        case ERROR_CODES.CONTENT_NOT_FOUND:
          // 목록 제거는 진입점 몫 — 화면은 로드 실패 처리다(common-error-handling.md 9장)
          this.ctx?.callbacks.onServerStateChanged?.();
          break;
        default:
          break;
      }
    }
    store.getState().patchSession({ state: 'load_failed', isPlaying: false, isBuffering: false });
  }

  /* ── 오디오 준비 ── */

  private createPlayer(
    url: string,
    startPositionSec: number,
    autoplay: boolean,
    generation: number,
  ): void {
    const player = createAudioPlayer(
      { uri: url },
      { updateInterval: PLAYBACK_STATUS_UPDATE_INTERVAL_MS },
    );
    this.player = player;
    this.pendingSetup = { startPositionSec, autoplay };
    player.setPlaybackRate(store.getState().rate, 'high');
    this.statusSubscription = player.addListener('playbackStatusUpdate', (status) => {
      if (generation !== this.generation) return;
      void this.handleStatus(status);
    });
    // playbackStatusUpdate가 상태 전이 때만 오는 환경(검증: Expo Go iOS)이 있어 위치·트래킹은
    // 플레이어 속성 폴링으로 보강한다 — 이벤트와 같은 경로(handleStatus)를 태워 규칙을 한 곳에 둔다
    this.uiTickTimer = setInterval(() => {
      if (generation !== this.generation) return;
      this.pollPlayerStatus();
    }, PLAYBACK_STATUS_UPDATE_INTERVAL_MS);
  }

  /** 상태 이벤트의 폴링 대역 — didJustFinish는 이벤트 몫이고 끝 도달은 위치 비교가 잡는다 */
  private pollPlayerStatus(): void {
    const player = this.player;
    if (!player) return;
    void this.handleStatus({
      currentTime: player.currentTime,
      duration: player.duration,
      playing: player.playing,
      didJustFinish: false,
      isBuffering: player.isBuffering,
      isLoaded: player.isLoaded,
      playbackRate: player.playbackRate,
    });
  }

  private async handleStatus(status: PlaybackStatusSnapshot): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;

    // 최초 로드 완료 — 저장 위치로 이동 후 재생. 그 전에는 컨트롤이 비활성이다(uiux 4.3)
    if (this.pendingSetup && status.isLoaded) {
      const { startPositionSec, autoplay } = this.pendingSetup;
      this.pendingSetup = null;
      if (startPositionSec > 0) {
        await this.player?.seekTo(startPositionSec);
        ctx.tracking = markSeek(ctx.tracking, startPositionSec);
      }
      store.getState().patchSession({ state: 'ready', positionSec: startPositionSec });
      this.activateLockScreen();
      if (autoplay) this.player?.play();
      return;
    }

    const session = store.getState().session;
    if (!session || session.state === 'withdrawn' || session.state === 'blocked') return;
    if (ctx.isEnded) return;

    ctx.tracking = observePosition(ctx.tracking, {
      positionSec: status.currentTime,
      isPlaying: status.playing,
      playbackRate: status.playbackRate,
    });

    const durationSec = ctx.durationSec;
    store.getState().patchSession({
      isPlaying: status.playing,
      isBuffering: status.isBuffering,
      positionSec: durationSec > 0 ? Math.min(status.currentTime, durationSec) : status.currentTime,
    });

    // 차감·재생 시작 기록은 소리가 실제로 난 시점 한 번뿐이다(paywall.md 4.3)
    if (!ctx.hasReportedPlayStart && status.playing) {
      void this.reportPlayStart();
    }

    // 재생 끝 도달 → PL3. 서버 길이보다 원본이 길어도 계약 길이에서 끝낸다
    const reachedEnd =
      status.didJustFinish ||
      (durationSec > 0 && status.currentTime >= durationSec - PLAYBACK_END_EPSILON_SEC);
    if (reachedEnd && status.isLoaded) {
      this.handlePlaybackEnded();
    }
  }

  /* ── 재생 시작 기록(차감) ── */

  private async reportPlayStart(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.hasReportedPlayStart || ctx.isReportingPlayStart) return;
    ctx.isReportingPlayStart = true;
    const generation = this.generation;

    try {
      const result = await startPlay({ contentId: ctx.contentId, entryPoint: ctx.entryPoint });
      if (generation !== this.generation || !this.ctx) return;
      ctx.hasReportedPlayStart = true;
      // 표시값은 적재 이후의 서버 값으로 덮어쓴다 — 클라이언트가 1을 빼지 않는다
      usePlayLimitStore.getState().applyPlayLimit(result.playLimit);
      if (result.libraryItem) {
        ctx.libraryItemId = result.libraryItem.id;
        store.getState().patchSession({
          libraryItem: { id: result.libraryItem.id, status: result.libraryItem.status },
        });
      }
      ctx.callbacks.onPlayStarted?.(result);
      ctx.callbacks.onServerStateChanged?.();

      if (ctx.isReplay) {
        // 재전송에도 같은 키를 쓴다 — 중복 적재가 replay_count를 부풀린다(player-api.md 4.4)
        ctx.replayIdempotencyKey ??= generateId();
        sendReplaySignal({
          contentId: ctx.contentId,
          idempotencyKey: ctx.replayIdempotencyKey,
        }).catch((error) => logger.debug('[player] replay signal failed', error));
      }
    } catch (error) {
      if (generation !== this.generation || !this.ctx) return;
      if (isApiError(error)) {
        switch (error.errorCode) {
          case ERROR_CODES.PLAY_LIMIT_EXCEEDED:
            // 경합(다른 기기 소진)에서만 나는 경로 — 화면이 닫고 페이월로 전환한다
            this.markBlocked('paywall', error.message);
            return;
          case ERROR_CODES.PLAY_LIMIT_REACHED:
            this.markBlocked('paid_limit', error.message);
            return;
          case ERROR_CODES.CONTENT_WITHDRAWN:
            this.markWithdrawn();
            return;
          default:
            break;
        }
      }
      // 소비 신호는 유실하지 않는다 — 재생은 유지한 채 재시도한다.
      // TODO(offline-queue): 큐 인프라 도입 시 발생 시각 순서 보존 전송으로 대체(architecture.md 5.4)
      logger.debug('[player] play start report failed, will retry');
      this.playReportRetryTimer = setTimeout(() => {
        this.playReportRetryTimer = null;
        const current = this.ctx;
        if (generation === this.generation && current && !current.hasReportedPlayStart) {
          current.isReportingPlayStart = false;
          if (store.getState().session?.isPlaying) void this.reportPlayStart();
        }
      }, PLAY_REPORT_RETRY_DELAY_MS);
      return;
    } finally {
      if (this.ctx) this.ctx.isReportingPlayStart = false;
    }
  }

  /* ── 컨트롤 ── */

  togglePlayPause(): void {
    const session = store.getState().session;
    if (!session || session.state !== 'ready') return;
    if (session.isPlaying) {
      this.pause();
    } else {
      this.player?.play();
    }
  }

  pause(): void {
    this.player?.pause();
    // 일시정지는 즉시 저장 트리거다(player.md 4.3)
    this.flushProgress('pause');
  }

  /** 시크바·±10초 공용. 끝 도달은 완료 처리다(player.md 4.2 — [10초 앞으로] 규칙) */
  seekTo(targetSec: number): void {
    const ctx = this.ctx;
    const session = store.getState().session;
    if (!ctx || !session || (session.state !== 'ready' && session.state !== 'ended')) return;

    const clamped = Math.max(0, targetSec);
    if (ctx.durationSec > 0 && clamped >= ctx.durationSec) {
      this.handlePlaybackEnded();
      return;
    }
    if (ctx.isEnded) {
      // 완료 상태에서 [10초 뒤로]로 끝부분을 되짚는 경로 — replay가 아니다(player-api.md 4.4)
      ctx.isEnded = false;
      store.getState().patchSession({ state: 'ready' });
    }
    ctx.tracking = markSeek(ctx.tracking, clamped);
    store.getState().patchSession({ positionSec: clamped });
    void this.player?.seekTo(clamped);
  }

  seekBackward(): void {
    const session = store.getState().session;
    if (!session) return;
    this.seekTo(Math.max(0, session.positionSec - SEEK_STEP_SEC));
  }

  seekForward(): void {
    const session = store.getState().session;
    if (!session) return;
    this.seekTo(session.positionSec + SEEK_STEP_SEC);
  }

  /** PL4 배속 — 현재 재생에 즉시 적용. 전역 저장(서버)은 화면 훅이 settings 계약으로 수행한다 */
  applyRate(rate: number): void {
    this.player?.setPlaybackRate(rate, 'high');
  }

  /* ── 완료·재청취 ── */

  private handlePlaybackEnded(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.isEnded) return;
    ctx.isEnded = true;
    this.player?.pause();
    store.getState().patchSession({
      state: 'ended',
      isPlaying: false,
      isBuffering: false,
      positionSec:
        ctx.durationSec > 0 ? ctx.durationSec : (store.getState().session?.positionSec ?? 0),
    });
    // 재생 종료는 즉시 저장 트리거다 — 완청 판정은 이 저장을 받은 서버가 한다(player.md 4.4)
    this.flushProgress('end');

    // duration이 없어 서버가 90%를 판정할 수 없는 콘텐츠의 폴백(player-api.md 4.3)
    if (ctx.durationSec <= 0 && ctx.libraryItemId) {
      const itemId = ctx.libraryItemId;
      getPlayerLibraryBridge()
        ?.completeItem(itemId)
        .catch((error) => logger.debug('[player] complete fallback failed', error));
    }
  }

  /** 완료 화면 ▶ — 위치 0부터 재생 + 재생 시작 기록 + replay 신호(허용 판정은 서버 몫) */
  private async restartFromBeginning(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.player) return;
    ctx.isEnded = false;
    ctx.hasReportedPlayStart = false;
    ctx.isReportingPlayStart = false;
    ctx.isReplay = true;
    ctx.replayIdempotencyKey = null;
    ctx.tracking = markSeek(ctx.tracking, 0);
    store.getState().patchSession({ state: 'ready', positionSec: 0 });
    await this.player.seekTo(0);
    this.player.play();
  }

  /* ── 위치 저장 ── */

  /** 즉시 저장 트리거(일시정지·화면 이탈·백그라운드·종료·세션 전환) — 응답을 기다리지 않는다 */
  flushProgress(trigger: string): void {
    void this.saveProgress(trigger);
  }

  private async saveProgress(trigger: string): Promise<void> {
    const ctx = this.ctx;
    const session = store.getState().session;
    // 재생 시작 기록 전에는 저장하지 않는다 — listened 적산 대상 행이 아직 없다(player-api.md 4.3)
    if (!ctx || !session || !ctx.hasReportedPlayStart || ctx.isSaving) return;

    ctx.isSaving = true;
    const generation = this.generation;
    const listenedDelta = peekListenedDelta(ctx.tracking);
    const positionSec = Math.round(session.positionSec);
    const maxReachedSec = Math.round(ctx.tracking.maxReachedSec);

    try {
      const result = await savePlaybackProgress({
        contentId: ctx.contentId,
        positionSec,
        maxReachedSec,
        listenedSecDelta: listenedDelta,
        contentVersion: ctx.contentVersion,
      });
      if (generation !== this.generation || this.ctx !== ctx) return;

      ctx.tracking = commitListenedDelta(ctx.tracking, listenedDelta);
      if (store.getState().session?.banner === 'network') {
        store.getState().patchSession({ banner: null });
      }
      if (result.contentVersion !== ctx.contentVersion) {
        // 재발행 감지 — 저장은 서버가 버렸다. 다음 진입에서 새 버전으로 0부터 재생한다(player.md 7)
        logger.debug('[player] content version changed', ctx.contentVersion, result.contentVersion);
        ctx.contentVersion = result.contentVersion;
      }
      const prevStatus = store.getState().session?.libraryItem?.status ?? null;
      if (result.libraryItem) {
        store.getState().patchSession({
          libraryItem: { id: result.libraryItem.id, status: result.libraryItem.status },
        });
        // 완청 전이는 서버 판정의 결과 통지다 — 90% 도달 시점에 화면은 아무것도 하지 않는다(uiux 4.4)
        if (result.libraryItem.status === 'completed' && prevStatus !== 'completed') {
          getPlayerLibraryBridge()?.invalidateLibrary();
          ctx.callbacks.onServerStateChanged?.();
        }
      }
    } catch (error) {
      if (generation !== this.generation) return;
      // 백그라운드 동기화 실패 — 사용자에게 알리지 않는다. delta 누적은 유지된다(4.3 정의)
      logger.debug('[player] progress save failed', trigger);
      if (
        isApiError(error) &&
        (error.errorCode === ERROR_CODES.NETWORK_ERROR || error.errorCode === ERROR_CODES.TIMEOUT)
      ) {
        const current = store.getState().session;
        // 재생 중 네트워크 끊김 — 버퍼가 이어지는 동안은 조용히, 멈춘 시점부터 배너(PL10)
        if (current && (current.isBuffering || !current.isPlaying)) {
          store.getState().patchSession({ banner: 'network' });
        }
      }
    } finally {
      ctx.isSaving = false;
    }
  }

  /* ── 서명 URL 갱신 ── */

  private scheduleUrlRefresh(expiresInSec: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const leadSec = Math.min(AUDIO_URL_REFRESH_LEAD_SEC, Math.floor(expiresInSec / 2));
    const delayMs = Math.max(5, expiresInSec - leadSec) * 1000;
    this.refreshTimer = setTimeout(() => void this.refreshAudioUrl(), delayMs);
  }

  private async refreshAudioUrl(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.isRefreshingUrl || !this.player) return;
    ctx.isRefreshingUrl = true;
    const generation = this.generation;

    try {
      const issue = await issueAudioUrls({ contentId: ctx.contentId });
      if (generation !== this.generation || !this.ctx) return;

      const session = store.getState().session;
      const wasPlaying = session?.isPlaying ?? false;
      const positionSec = session?.positionSec ?? 0;
      // 재생기 소스 교체 — 갱신 성공 시 화면 변화가 없어야 한다(uiux 4.9)
      this.player.replace({ uri: issue.audio.url });
      await this.player.seekTo(positionSec);
      ctx.tracking = markSeek(ctx.tracking, positionSec);
      if (wasPlaying) this.player.play();
      if (store.getState().session?.banner === 'refresh_failed') {
        store.getState().patchSession({ banner: null });
      }
      this.scheduleUrlRefresh(issue.audio.expiresInSec);
    } catch (error) {
      if (generation !== this.generation || !this.ctx) return;
      if (isApiError(error) && error.errorCode === ERROR_CODES.CONTENT_WITHDRAWN) {
        // 재생 중 회수 — 일시정지 + PL9(player-api.md 4.1)
        this.markWithdrawn();
        return;
      }
      // 갱신 실패 — 버퍼가 이어지는 동안 재시도하고, 배너 자리에 재시도 안내를 둔다(uiux 4.9)
      store.getState().patchSession({ banner: 'refresh_failed' });
      this.refreshTimer = setTimeout(() => void this.refreshAudioUrl(), URL_REFRESH_RETRY_DELAY_MS);
    } finally {
      if (this.ctx) this.ctx.isRefreshingUrl = false;
    }
  }

  /** 배너 [다시 시도] — 갱신 실패의 수동 재시도. 인플라이트 중 연타는 가드가 무시한다 */
  retryUrlRefresh(): void {
    void this.refreshAudioUrl();
  }

  /* ── 원문 보기(FR-12) ── */

  /**
   * 클릭 기록만 담당한다 — 인앱 브라우저 열기는 이 요청의 성공을 기다리지 않으므로(player-api.md
   * 4.5) 호출자가 병행 수행한다. 실패는 사용자에게 알리지 않는다.
   */
  recordSourceLinkClick(contentId: string): void {
    sendSourceLinkClick({ contentId, idempotencyKey: generateId() }).catch((error) =>
      logger.debug('[player] source link click record failed', error),
    );
  }

  /* ── 상태 전이·정리 ── */

  private markBlocked(kind: 'paywall' | 'paid_limit', message: string | null): void {
    this.player?.pause();
    store.getState().patchSession({
      state: 'blocked',
      blocked: { kind, message },
      isPlaying: false,
    });
  }

  private markWithdrawn(): void {
    const ctx = this.ctx;
    this.player?.pause();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    store.getState().patchSession({ state: 'withdrawn', isPlaying: false, isBuffering: false });
    ctx?.callbacks.onWithdrawn?.();
    ctx?.callbacks.onServerStateChanged?.();
  }

  /** PL9 [닫기]·blocked 전환 후 화면이 호출한다 — 세션을 내리고 미니플레이어도 띄우지 않는다 */
  clearSession(): void {
    this.generation += 1;
    this.teardownPlayer();
    this.ctx = null;
    store.getState().setSession(null);
  }

  /** 미니플레이어 스와이프 종료(PL11) — 위치는 저장하고, 이번 실행에서는 다시 띄우지 않는다 */
  dismiss(): void {
    this.flushProgress('dismiss');
    this.generation += 1;
    this.teardownPlayer();
    this.ctx = null;
    store.setState({ session: null, isMiniPlayerDismissed: true });
  }

  private teardownPlayer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.uiTickTimer) {
      clearInterval(this.uiTickTimer);
      this.uiTickTimer = null;
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.playReportRetryTimer) {
      clearTimeout(this.playReportRetryTimer);
      this.playReportRetryTimer = null;
    }
    this.statusSubscription?.remove();
    this.statusSubscription = null;
    this.pendingSetup = null;
    if (this.player) {
      try {
        this.player.clearLockScreenControls();
      } catch {
        // Expo Go 등 잠금화면 미지원 환경 — 무시
      }
      try {
        this.player.pause();
        this.player.remove();
      } catch (error) {
        logger.debug('[player] teardown failed', error);
      }
      this.player = null;
    }
  }

  /* ── 환경 구성 ── */

  private ensureAudioMode(): void {
    if (this.isAudioModeConfigured) return;
    this.isAudioModeConfigured = true;
    // 잠금화면 컨트롤은 doNotMix가 전제다. 백그라운드 재생은 dev build에서만 활성된다(Expo Go 제한)
    setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: true,
    }).catch((error) => logger.warn('[player] audio mode setup failed', error));
  }

  private ensureAppStateListener(): void {
    if (this.appStateSubscription) return;
    this.appStateSubscription = AppState.addEventListener('change', (state) => {
      // 백그라운드 진입은 즉시 저장 트리거다(player.md 4.3). 재생 자체는 유지된다
      if (state === 'background') this.flushProgress('background');
    });
  }

  private ensureSyncTimer(): void {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      const session = store.getState().session;
      if (session?.isPlaying) void this.saveProgress('interval');
    }, PLAYBACK_PROGRESS_SYNC_INTERVAL_MS);
  }

  private activateLockScreen(): void {
    const session = store.getState().session;
    if (!this.player || !session) return;
    try {
      // 잠금화면 ±탐색도 화면과 같은 ±10초 문법이다(uiux 4.1) — 표시 여부만 켠다
      this.player.setActiveForLockScreen(
        true,
        {
          title: session.meta.title ?? undefined,
          artist: session.meta.authorName ?? undefined,
          albumTitle: session.meta.sourceName ?? undefined,
          artworkUrl: session.meta.thumbnailUrl ?? undefined,
        },
        { showSeekBackward: true, showSeekForward: true },
      );
    } catch (error) {
      // Expo Go 등 네이티브 미구성 환경에서는 잠금화면 컨트롤 없이 재생만 한다
      logger.debug('[player] lock screen activation unavailable', error);
    }
  }
}

/** 전역 단일 인스턴스 — 재생 제어는 전부 이 객체를 경유한다 */
export const playbackService = new PlaybackService();
