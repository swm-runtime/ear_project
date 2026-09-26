import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { APP_VERSION } from '@/shared/lib/app-version';
import { getDevicePlatform } from '@/shared/lib/device-platform';
import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import { fetchVersionGate } from '../api/app-version.api';
import type { VersionGateVerdict } from '../api/app-version.dto';
import { RECHECK_AFTER_BACKGROUND_MS } from '../app-update.constants';
import { useAppUpdateStore } from '../store/app-update.store';

/** 마지막 성공 판정의 저장 형태 — 앱 버전·플랫폼이 다르면 무시한다 */
interface CachedVerdict {
  appVersion: string;
  platform: string;
  verdict: Exclude<VersionGateVerdict, { kind: 'unknown' }>;
  checkedAt: string;
}

const readCachedVerdict = async (): Promise<VersionGateVerdict | null> => {
  try {
    const raw = await secureStorage.get(STORAGE_KEYS.APP_UPDATE_LAST_VERDICT);
    if (raw === null) return null;
    const cached = JSON.parse(raw) as Partial<CachedVerdict>;
    if (cached.appVersion !== APP_VERSION || cached.platform !== getDevicePlatform()) return null;
    if (cached.verdict?.kind !== 'ok' && cached.verdict?.kind !== 'required') return null;
    return cached.verdict;
  } catch (error) {
    logger.warn('[app-update] cached verdict unreadable', error);
    return null;
  }
};

const writeCachedVerdict = async (verdict: VersionGateVerdict): Promise<void> => {
  if (verdict.kind === 'unknown') return;
  const cached: CachedVerdict = {
    appVersion: APP_VERSION,
    platform: getDevicePlatform(),
    verdict,
    checkedAt: new Date().toISOString(),
  };
  try {
    await secureStorage.set(STORAGE_KEYS.APP_UPDATE_LAST_VERDICT, JSON.stringify(cached));
  } catch (error) {
    logger.warn('[app-update] cached verdict not saved', error);
  }
};

/** 판정을 스토어에 반영한다. `unknown` 은 캐시로 대신하고, 캐시도 없으면 통과(fail-open) */
const applyVerdict = async (verdict: VersionGateVerdict): Promise<void> => {
  const store = useAppUpdateStore.getState();
  if (verdict.kind === 'unknown') {
    const cached = await readCachedVerdict();
    if (cached?.kind === 'required') {
      store.markRequired();
      return;
    }
    // 캐시된 통과의 권장 안내는 다시 띄우지 않는다 — 옛 응답으로 잔소리하지 않는다
    store.markPassed(false);
    return;
  }
  await writeCachedVerdict(verdict);
  if (verdict.kind === 'required') store.markRequired();
  else store.markPassed(verdict.updateAvailable);
};

let inflight: Promise<void> | null = null;

/**
 * 관문 판정 한 번 — 동시 호출은 하나로 합친다(콜드 스타트와 30분 복귀가 겹칠 수 있다).
 * 이미 `required` 면 다시 묻지 않는다 — 강제 화면에서 스토어로만 나간다
 */
export const checkAppVersionGate = (): Promise<void> => {
  if (useAppUpdateStore.getState().gate === 'required') return Promise.resolve();
  if (inflight) return inflight;
  inflight = fetchVersionGate({ appVersion: APP_VERSION, platform: getDevicePlatform() })
    .then(applyVerdict)
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

let appStateSubscription: NativeEventSubscription | null = null;
let backgroundedAt: number | null = null;

/**
 * 백그라운드 30분 이상 뒤 포그라운드 복귀 → 버전 체크만 재수행(`splash.md` 2장). 화면 분기는 하지 않는다 —
 * 단 최소 지원 미만으로 바뀌었으면 강제 업데이트 화면은 뜬다(관문이 `gate === 'required'` 를 그린다).
 * 판정은 기기 시각으로 한다 — 정책 판정이 아니라 "다시 물을 때가 됐나" 이고, 시계가 어긋나도 최악은 한 번 더 묻는 것이다
 */
export const startAppVersionRecheck = (): void => {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background') {
      backgroundedAt = Date.now();
      return;
    }
    if (state !== 'active' || backgroundedAt === null) return;
    const elapsed = Date.now() - backgroundedAt;
    backgroundedAt = null;
    if (elapsed >= RECHECK_AFTER_BACKGROUND_MS) void checkAppVersionGate();
  });
};
