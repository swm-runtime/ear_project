import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import type { PlanTrial } from '../profile.types';

/**
 * P11 가입 체험 안내 팝업의 "한 번"(profile-uiux.md 4.11 · subscription.md 4.8).
 *
 * 서버에는 팝업을 봤는지 기록하는 값이 없다 — 재생 확인 팝업 억제(`play-confirm-suppression.service.ts`)와 같은
 * 기기 로컬 상태다. 저장하는 값은 **이미 본 계정의 id** 하나다: 같은 기기에서 다른 계정이 새로 가입하면 그 계정에는
 * 다시 뜨고, 같은 계정이 앱을 다시 열거나 화면이 다시 마운트돼도 뜨지 않는다.
 *
 * **여는 조건은 "체험 값이 있고 이 계정이 아직 안 봤다"이다**(KAN-121 — 종전 "온보딩을 막 끝낸 진입에서만"을 넓혔다).
 * 체험 도입 전 가입자도 앱 시작에 한 번 본다. KAN-119 때 이미 본 계정은 같은 키에 id가 남아 있어 다시 뜨지 않는다.
 * 기기 기억이라 저장소가 비는 재설치·새 기기에서는 체험 기간 안이면 한 번 더 뜰 수 있다 — 같은 날짜를 다시 알릴 뿐이라 막지 않는다
 * (서버 컬럼을 만들지 않는다 — subscription.md 4.8).
 */

/** 띄울지 판정 — 체험 값이 있고, 이 계정이 이 기기에서 아직 보지 않았을 때만 */
export const shouldShowSignupTrialNotice = (input: {
  trial: PlanTrial | null;
  userId: string;
  seenUserId: string | null;
}): boolean => input.trial !== null && input.seenUserId !== input.userId;

/** 저장된 "이미 본 계정 id". 읽지 못하면 null — 한 번 더 보이는 쪽이 영영 못 보는 쪽보다 낫다 */
export const readSignupTrialNoticeSeenUserId = async (): Promise<string | null> => {
  try {
    return await secureStorage.get(STORAGE_KEYS.SIGNUP_TRIAL_NOTICE_SEEN);
  } catch (error) {
    logger.debug('[profile] signup trial notice flag read failed', error);
    return null;
  }
};

/** 닫는 순간 기록한다. 실패해도 이번 실행에서는 화면 상태로 닫혀 있다 */
export const markSignupTrialNoticeSeen = async (userId: string): Promise<void> => {
  try {
    await secureStorage.set(STORAGE_KEYS.SIGNUP_TRIAL_NOTICE_SEEN, userId);
  } catch (error) {
    logger.debug('[profile] signup trial notice flag write failed', error);
  }
};
