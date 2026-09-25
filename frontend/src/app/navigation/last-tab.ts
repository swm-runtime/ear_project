import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

/**
 * 마지막으로 본 탭의 복원(`splash.md` 4장 4-1 — 2026-09-15 신설).
 *
 * **탭까지만 복원한다.** 콘텐츠 상세·설정 하위·검색 결과는 되살리지 않는다 — 스택까지
 * 되살리면 사용자가 열지 않은 화면이 떠 있는 것처럼 읽히고, 상세 화면은 그 사이
 * 사라질 수 있어(회수·삭제) 존재 판정과 실패 경로가 따로 필요해진다. 탭은 사라지지 않는다.
 *
 * **기기 로컬에만 둔다.** 세션(메모리)에 두면 앱 종료와 함께 사라져 목적을 달성하지 못한다.
 * 서버에 보내지 않는다 — 기기마다 마지막으로 본 탭이 다른 것이 자연스럽다.
 */

/** 복원 대상 탭. `MainTabParamList`의 키와 같아야 한다 */
export type RestorableTab = 'Library' | 'Explore' | 'Profile';

const RESTORABLE: readonly RestorableTab[] = ['Library', 'Explore', 'Profile'];

/**
 * 이 시간이 지나면 복원하지 않는다. 잠깐 다른 앱에 갔다 돌아오는 경우를 살리는 것이
 * 목적이고, **어제 본 탭이 오늘 뜨면 편의가 아니라 어색함**이다.
 *
 * 기기 시각으로 판정한다 — 재생 한도·만료·서비스 날짜 같은 정책 판정이 아니라 화면
 * 복원이라 서버 판정 대상이 아니다. 시계가 어긋나도 최악은 "라이브러리로 간다"이고,
 * 그것은 이 기능이 없던 종전 동작과 같다.
 */
const RESTORE_WINDOW_MS = 30 * 60 * 1000;

const isRestorable = (value: string): value is RestorableTab =>
  (RESTORABLE as readonly string[]).includes(value);

/** 탭을 떠난 시각과 함께 기록한다. 실패는 조용히 넘긴다 — 복원은 편의지 기능이 아니다 */
export const rememberTab = (tab: RestorableTab): void => {
  void secureStorage
    .set(STORAGE_KEYS.LAST_TAB, `${tab}:${Date.now()}`)
    .catch((error) => logger.debug('[nav] remember tab failed', error));
};

/**
 * 복원할 탭. 기록이 없거나·형식이 깨졌거나·30분이 지났으면 `null`을 준다
 * (호출부가 라이브러리로 떨어뜨린다).
 */
export const readTabToRestore = async (): Promise<RestorableTab | null> => {
  try {
    const raw = await secureStorage.get(STORAGE_KEYS.LAST_TAB);
    if (!raw) return null;

    // 탭 이름에 콜론이 없다는 가정에 기대지 않는다 — 마지막 콜론으로 가른다
    const at = raw.lastIndexOf(':');
    if (at <= 0) return null;
    const tab = raw.slice(0, at);
    const savedAt = Number(raw.slice(at + 1));

    if (!isRestorable(tab) || !Number.isFinite(savedAt)) return null;

    // 미래 시각(시계를 뒤로 돌린 기기)도 버린다 — 만료 판정이 성립하지 않는다
    const elapsed = Date.now() - savedAt;
    if (elapsed < 0 || elapsed > RESTORE_WINDOW_MS) return null;

    return tab;
  } catch (error) {
    logger.debug('[nav] read tab failed', error);
    return null;
  }
};

/*
 * `initialRouteName`은 **첫 마운트에만** 읽히는데 저장소 조회는 비동기다. 그래서 실행
 * 관문(스플래시)이 기다리는 동안 미리 읽어 두고, 탭이 마운트될 때 동기로 꺼내 쓴다.
 *
 * **한 번 쓰면 비운다.** 앱 수명 안에서 로그아웃 → 재로그인으로 탭이 다시 마운트될 때
 * 실행 시점의 기록이 또 적용되면, 그때는 "마지막으로 본 탭"이 아니라 남의 흔적이다.
 */
let primed: RestorableTab | null = null;

/** 관문이 호출한다. 실패해도 관문을 막지 않는다 — 복원은 편의지 기능이 아니다 */
export const primeTabToRestore = async (): Promise<void> => {
  primed = await readTabToRestore();
};

/** 탭 내비게이터가 마운트되며 한 번 꺼낸다 */
export const takePrimedTab = (): RestorableTab | null => {
  const tab = primed;
  primed = null;
  return tab;
};

/** 로그아웃·탈퇴 — 다음 사용자가 앞 사용자의 탭에서 시작하면 안 된다 */
export const forgetTab = (): void => {
  primed = null;
  void secureStorage
    .remove(STORAGE_KEYS.LAST_TAB)
    .catch((error) => logger.debug('[nav] forget tab failed', error));
};
