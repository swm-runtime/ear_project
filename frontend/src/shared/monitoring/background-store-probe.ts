import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { logger } from '@/shared/lib/logger';

import { addBreadcrumb } from './sentry';

/**
 * **백그라운드 재렌더 진단** — 앱이 화면을 떠나 있는 동안 전역 스토어·쿼리 캐시가 몇 번 갱신됐는지 세어, 돌아올 때
 * Sentry breadcrumb 로 남긴다. 동작은 아무것도 바꾸지 않는다(세기만 한다).
 *
 * 왜: Android 는 액티비티가 내려가 있으면 프레임이 돌지 않아 네이티브 Animated 명령 큐를 비우지 못한다. 그동안 JS 가
 * 화면을 다시 그리면 명령만 쌓이고, 복귀 첫 프레임에 한꺼번에 실행하다 자바 힙 256MB 를 넘겨 죽는다
 * (`NativeAnimatedModule.executeBatch → createAnimatedNode` 의 OutOfMemoryError). EAR-APP-H(2026-10-12, 1.1.0)는
 * 백그라운드 재생의 0.5초 위치 틱이 원인이라 #1469 로 막았는데, EAR-APP-K(2026-10-19, 1.2.1)는 **백그라운드에 재생이
 * 없었는데도**(5초 간격 진행 저장이 27분간 0건) 같은 자리에서 죽었다. 무엇이 화면을 다시 그렸는지 이벤트만으로는
 * 알 수 없어, 다음 재발 때 바로 읽히도록 "비활성 동안 어느 스토어의 어느 필드가 몇 번 바뀌었나"를 남긴다.
 *
 * 남기는 값은 **횟수와 필드 이름뿐**이다 — 스토어 값 자체(세션·사용자·콘텐츠)는 breadcrumb 에 넣지 않는다.
 */

/** 세는 대상 — zustand 스토어의 `subscribe(listener(state, previous))` 모양이면 된다 */
export interface ProbeStore {
  subscribe: (listener: (state: unknown, previous: unknown) => void) => () => void;
}

/** TanStack Query 의 `queryClient.getQueryCache()` — `updated` 이벤트만 센다(데이터·상태 변화 = 구독 화면 재렌더) */
export interface ProbeQueryCache {
  subscribe: (listener: (event: { type: string }) => void) => () => void;
}

export interface BackgroundStoreProbeOptions {
  stores: Record<string, ProbeStore>;
  queryCache?: ProbeQueryCache;
  /** 떠날 때·돌아올 때 함께 남길 재생 여부 — 재생 틱(EAR-APP-H)과 다른 원인을 가르는 축 */
  isPlaying?: () => boolean;
  /** 테스트 주입용 — 기본은 `AppState` */
  appState?: Pick<typeof AppState, 'currentState' | 'addEventListener'>;
  now?: () => number;
}

/** 비활성 동안 갱신이 이 수를 지날 때마다 중간 breadcrumb — 복귀 직후 죽어 복귀 breadcrumb 이 못 남는 경우를 대비한다 */
export const PROBE_MILESTONES = [500, 2_000, 10_000, 50_000] as const;
/** 필드별 횟수는 상위 몇 개만 — breadcrumb 하나는 작아야 한다 */
const TOP_KEYS = 12;

interface Window {
  startedAt: number;
  leftWhile: AppStateStatus;
  isPlayingAtExit: boolean | null;
  total: number;
  byStore: Record<string, number>;
  byKey: Record<string, number>;
  nextMilestone: number;
}

const changedKeys = (state: unknown, previous: unknown): string[] => {
  if (
    typeof state !== 'object' ||
    state === null ||
    typeof previous !== 'object' ||
    previous === null
  ) {
    return [];
  }
  const next = state as Record<string, unknown>;
  const prev = previous as Record<string, unknown>;
  const keys = new Set([...Object.keys(next), ...Object.keys(prev)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (typeof next[key] === 'function') continue;
    if (!Object.is(next[key], prev[key])) changed.push(key);
  }
  return changed;
};

const topEntries = (record: Record<string, number>, limit: number): Record<string, number> =>
  Object.fromEntries(
    Object.entries(record)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit),
  );

const summarize = (window: Window, now: number) => ({
  durationSec: Math.round((now - window.startedAt) / 1000),
  leftWhile: window.leftWhile,
  isPlayingAtExit: window.isPlayingAtExit,
  total: window.total,
  byStore: window.byStore,
  byKey: topEntries(window.byKey, TOP_KEYS),
});

/**
 * 켠다 — 앱 시작 때 한 번(app/bootstrap). 반환값을 부르면 구독을 전부 걷는다.
 * `active` 가 아닌 동안만 센다(`inactive`·`background` 모두 — 화면이 안 그려지는 상태는 둘 다다).
 */
export const startBackgroundStoreProbe = (options: BackgroundStoreProbeOptions): (() => void) => {
  const appState = options.appState ?? AppState;
  const now = options.now ?? Date.now;
  let window: Window | null = null;

  const open = (status: AppStateStatus) => {
    const isPlaying = options.isPlaying?.() ?? null;
    window = {
      startedAt: now(),
      leftWhile: status,
      isPlayingAtExit: isPlaying,
      total: 0,
      byStore: {},
      byKey: {},
      nextMilestone: 0,
    };
    addBreadcrumb({
      category: 'app.background-probe',
      message: '화면을 떠남 — 스토어 갱신을 센다',
      data: { leftWhile: status, isPlaying },
    });
  };

  const close = () => {
    if (window === null) return;
    const summary = summarize(window, now());
    window = null;
    const isPlaying = options.isPlaying?.() ?? null;
    addBreadcrumb({
      category: 'app.background-probe',
      message: `화면에 돌아옴 — 비활성 ${summary.durationSec}초 동안 스토어 갱신 ${summary.total}회`,
      data: { ...summary, isPlayingAtReturn: isPlaying },
    });
    logger.debug('[probe] background store updates', summary);
  };

  const count = (store: string, keys: string[]) => {
    if (window === null) return;
    window.total += 1;
    window.byStore[store] = (window.byStore[store] ?? 0) + 1;
    for (const key of keys) {
      const name = `${store}.${key}`;
      window.byKey[name] = (window.byKey[name] ?? 0) + 1;
    }
    const milestone = PROBE_MILESTONES[window.nextMilestone];
    if (milestone !== undefined && window.total >= milestone) {
      window.nextMilestone += 1;
      addBreadcrumb({
        category: 'app.background-probe',
        level: 'warning',
        message: `비활성 중 스토어 갱신 ${milestone}회 지남`,
        data: summarize(window, now()),
      });
    }
  };

  const unsubscribes: (() => void)[] = [];
  for (const [name, store] of Object.entries(options.stores)) {
    unsubscribes.push(
      store.subscribe((state, previous) => count(name, changedKeys(state, previous))),
    );
  }
  if (options.queryCache) {
    unsubscribes.push(
      options.queryCache.subscribe((event) => {
        if (event.type === 'updated') count('queryCache', []);
      }),
    );
  }

  if (appState.currentState !== 'active') open(appState.currentState);
  const subscription: NativeEventSubscription = appState.addEventListener('change', (status) => {
    if (status === 'active') close();
    else if (window === null) open(status);
  });

  return () => {
    subscription.remove();
    for (const unsubscribe of unsubscribes) unsubscribe();
    window = null;
  };
};
