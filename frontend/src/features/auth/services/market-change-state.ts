import * as SecureStore from 'expo-secure-store';

import { logger } from '@/shared/lib/logger';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import type { Market } from '../auth.types';

/**
 * 시장 전환 뒤 재온보딩 중인가(KAN-228 — global-api.md 4.11). 서버는 이 상태를 따로 주지 않는다 — 응답의
 * `onboarding_completed: false` 는 첫 가입과 구별되지 않는다. 그래서 전환에 성공한 기기가 적어 둔다.
 *
 * - **GA4 `onboarding_complete` 를 다시 보내지 않는다** — 가입 퍼널이 두 번 센다(티켓 7번).
 * - `revertTo` — 재온보딩을 마치기 전 직전 시장으로 되돌리기는 서버가 하루 1회에서 빼 준다(한 번만). 주제 화면이 이
 *   값으로 [되돌리기]를 그린다. 되돌린 뒤에는 null(되돌리기를 다시 되돌리면 429)이지만 재온보딩 표시는 남는다.
 *
 * 앱을 다시 켜도 이어지도록 기기에 저장한다(화면 모드·표시 언어와 같은 동기 읽기). 다른 기기는 모른다 — 그 기기의
 * 재온보딩 완료는 GA 를 한 번 더 보낼 수 있다(드문 경로라 받아들인다).
 */
interface ReonboardingState {
  revertTo: Market | null;
}

const read = (): ReonboardingState | null => {
  try {
    const raw = SecureStore.getItem(STORAGE_KEYS.MARKET_CHANGE_REONBOARDING);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<ReonboardingState>;
    const revertTo =
      parsed.revertTo === 'kr' || parsed.revertTo === 'global' ? parsed.revertTo : null;
    return { revertTo };
  } catch {
    // 못 읽으면(웹·옛 빌드) 첫 가입처럼 다룬다 — 표시일 뿐 판정이 아니다
    return null;
  }
};

let state: ReonboardingState | null = read();

const write = (next: ReonboardingState | null): void => {
  state = next;
  try {
    if (next === null)
      SecureStore.deleteItemAsync(STORAGE_KEYS.MARKET_CHANGE_REONBOARDING).catch(() => {});
    else SecureStore.setItem(STORAGE_KEYS.MARKET_CHANGE_REONBOARDING, JSON.stringify(next));
  } catch (error) {
    logger.warn('[auth] market change state persist failed', error);
  }
};

/** 전환 성공 직후 — 되돌리기였다면 다시 되돌릴 수 없다(`revertTo: null`) */
export const markReonboardingAfterMarketChange = (input: {
  previousMarket: Market;
  isRevert: boolean;
}): void => {
  write({ revertTo: input.isRevert ? null : input.previousMarket });
};

/** 시장 전환 뒤 재온보딩 중인가 — 온보딩 완료 GA 를 거른다 */
export const isReonboardingAfterMarketChange = (): boolean => state !== null;

/** 주제 화면 [되돌리기]의 대상 시장 — 없으면 null */
export const getMarketChangeRevertTarget = (): Market | null => state?.revertTo ?? null;

/** 재온보딩을 마쳤거나 로그아웃 — 표시를 지운다 */
export const clearReonboardingAfterMarketChange = (): void => {
  if (state === null) return;
  write(null);
};
