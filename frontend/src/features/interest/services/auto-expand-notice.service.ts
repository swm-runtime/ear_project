import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

/**
 * 자동 추가 주제 안내 팝업의 "한 번"(KAN-181 · PM 2026-10-15 — 빗금만으로는 사용자가 알아채지 못한다).
 *
 * 서버에는 팝업을 봤는지 기록하는 값이 없다 — 가입 체험 안내(`signup-trial-notice.service.ts`)와 같은 기기 로컬
 * 상태다. 저장하는 값은 **이미 본 계정의 id** 하나다: 같은 기기에서 다른 계정이 로그인하면 그 계정에는 다시 뜨고,
 * 같은 계정이 화면을 다시 열어도 뜨지 않는다. 재설치·새 기기에서는 한 번 더 뜰 수 있다 — 같은 안내를 다시 보일 뿐이라
 * 막지 않는다(서버 컬럼을 만들지 않는다).
 */

/** 띄울지 판정 — 자동 추가 주제가 있고, 이 계정이 이 기기에서 아직 보지 않았을 때만 */
export const shouldShowAutoExpandNotice = (input: {
  hasAutoExpand: boolean;
  userId: string;
  seenUserId: string | null;
}): boolean => input.hasAutoExpand && input.seenUserId !== input.userId;

/** 저장된 "이미 본 계정 id". 읽지 못하면 null — 한 번 더 보이는 쪽이 영영 못 보는 쪽보다 낫다 */
export const readAutoExpandNoticeSeenUserId = async (): Promise<string | null> => {
  try {
    return await secureStorage.get(STORAGE_KEYS.INTEREST_AUTO_EXPAND_NOTICE_SEEN);
  } catch (error) {
    logger.debug('[interest] auto-expand notice flag read failed', error);
    return null;
  }
};

/** 닫는 순간 기록한다. 실패해도 이번 실행에서는 화면 상태로 닫혀 있다 */
export const markAutoExpandNoticeSeen = async (userId: string): Promise<void> => {
  try {
    await secureStorage.set(STORAGE_KEYS.INTEREST_AUTO_EXPAND_NOTICE_SEEN, userId);
  } catch (error) {
    logger.debug('[interest] auto-expand notice flag write failed', error);
  }
};
