import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import { usePlayLimitStore } from '../store/play-limit.store';

/**
 * [오늘은 그만 보기] 억제 상태(library.md 4.3).
 * 저장하는 값은 만료 타이머가 아니라 억제한 서비스 날짜 자체다 — 기기 시각을 신뢰하지 않는다.
 * 기기 단위 하나의 키다 — 화면별로 따로 저장하지 않는다(explore-uiux.md 8장).
 * 기기 로컬 값이므로 재설치·기기 변경 시 사라지는 것이 의도된 동작이다.
 */

/** 앱 시작(라이브러리 진입) 시 저장된 억제 날짜를 store로 올린다 */
export const hydrateSuppressedServiceDate = async (): Promise<void> => {
  const stored = await secureStorage.get(STORAGE_KEYS.PLAY_CONFIRM_SUPPRESSED_DATE);
  usePlayLimitStore.getState().setSuppressedServiceDate(stored);
};

/** 억제 등록 — 유효 기간은 서버가 내려준 오늘의 서비스 날짜까지다(04:00 KST 경계) */
export const suppressPlayConfirmForToday = async (serviceDate: string): Promise<void> => {
  usePlayLimitStore.getState().setSuppressedServiceDate(serviceDate);
  await secureStorage.set(STORAGE_KEYS.PLAY_CONFIRM_SUPPRESSED_DATE, serviceDate);
};
