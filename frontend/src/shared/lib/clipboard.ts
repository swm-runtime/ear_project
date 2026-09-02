import { logger } from './logger';

/**
 * 클립보드 대역 — 클립보드 라이브러리(expo-clipboard)가 아직 설치되지 않아 개발 환경에서만
 * 동작하는 스텁이다(notification-permission.service와 같은 관례).
 * 설치 시 이 모듈의 구현만 교체하면 호출부는 그대로 쓴다.
 */
export const copyToClipboard = async (text: string): Promise<void> => {
  if (__DEV__) {
    logger.debug('[clipboard] dev stub: copied', text);
    return;
  }
  throw new Error('clipboard library not integrated yet');
};
