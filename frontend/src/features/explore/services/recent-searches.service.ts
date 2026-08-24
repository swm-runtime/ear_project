import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

/**
 * 최근 검색어(explore.md 4.5-4) — 기기 로컬 10건. 서버에 보내지 않는다(SearchHistory는
 * 테이블이 아니다 — domain.md 13.1). 같은 검색어는 중복 저장하지 않고 최신으로 끌어올리며,
 * 10건 초과 시 가장 오래된 것부터 밀어낸다. 재설치·기기 변경 시 사라지는 것이 의도다.
 *
 * 저장 시점은 호출자(useExploreSearchScreen)가 정한다 — "검색이 사용자 행동으로 이어진 때"만
 * 부른다. 디바운스 자동 검색마다 저장하면 타이핑 중간어가 목록을 오염시킨다.
 *
 * TODO(MMKV): architecture.md 7.2가 정한 저장소는 MMKV다 — 도입 전까지 억제 플래그
 * (play-confirm-suppression.service.ts)와 같은 secureStorage 관례를 따른다.
 */

const MAX_RECENT_SEARCHES = 10;

const parseStored = (stored: string | null): string[] => {
  if (!stored) return [];
  try {
    const value: unknown = JSON.parse(stored);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // 손상된 값은 버린다 — 로컬 편의 기능이라 복구를 시도하지 않는다
    return [];
  }
};

const persist = async (searches: string[]): Promise<void> => {
  try {
    await secureStorage.set(STORAGE_KEYS.EXPLORE_RECENT_SEARCHES, JSON.stringify(searches));
  } catch (error) {
    // 저장 실패는 화면 동작(메모리 상태)에 영향을 주지 않는다 — 로깅만 한다
    logger.warn('[explore] recent searches persist failed', error);
  }
};

export const loadRecentSearches = async (): Promise<string[]> => {
  try {
    return parseStored(await secureStorage.get(STORAGE_KEYS.EXPLORE_RECENT_SEARCHES));
  } catch (error) {
    logger.warn('[explore] recent searches load failed', error);
    return [];
  }
};

/** 맨 앞에 끌어올려 저장하고 갱신된 목록을 돌려준다 — 화면 상태는 이 반환값으로 맞춘다 */
export const addRecentSearch = async (query: string): Promise<string[]> => {
  const current = await loadRecentSearches();
  const next = [query, ...current.filter((q) => q !== query)].slice(0, MAX_RECENT_SEARCHES);
  await persist(next);
  return next;
};

export const removeRecentSearch = async (query: string): Promise<string[]> => {
  const next = (await loadRecentSearches()).filter((q) => q !== query);
  await persist(next);
  return next;
};

export const clearRecentSearches = async (): Promise<string[]> => {
  await persist([]);
  return [];
};
