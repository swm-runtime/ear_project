/**
 * 고정 스트림 주소 ↔ 최신 서명 URL 표의 JS 쪽 손잡이(KAN-124 · architecture.md 5.1).
 *
 * 플레이어에는 재생 내내 바뀌지 않는 `ear-audio://<key>` 주소를 주고, 서명 URL 은 이 표에만 넣는다. 네이티브
 * (expo-audio 패치 — `patches/expo-audio+57.0.3.patch`)가 바이트 요청(Range)을 낼 때마다 표의 최신 URL 로
 * 바꿔 보낸다. 그래서 4분마다 URL 을 갱신해도 음원을 갈아 끼우지 않는다 — 버퍼·위치·배속이 그대로다.
 *
 * **패치가 없는 빌드(runtime 31 이하)에는 `setStreamUrl` 이 없다.** 그 빌드는 이 JS 를 OTA 로 받으므로
 * 함수 유무로 판별하고, 없으면 호출부가 종전대로 서명 URL 을 직접 주고 갱신 때 `replace` 한다.
 */
import { requireOptionalNativeModule } from 'expo';

import { logger } from '@/shared/lib/logger';

interface ExpoAudioStreamNative {
  setStreamUrl?: (streamUri: string, url: string) => void;
  clearStreamUrl?: (streamUri: string) => void;
}

const STREAM_SCHEME = 'ear-audio';

/** 매번 찾는다 — 전역 모듈 표 조회라 가볍고, 캐시하지 않으면 테스트가 빌드 종류를 바꿔 끼울 수 있다 */
const getNative = (): ExpoAudioStreamNative | null =>
  requireOptionalNativeModule<ExpoAudioStreamNative>('ExpoAudio');

/** 이 빌드의 expo-audio 가 고정 스트림 주소를 지원하는가 — 네이티브 함수 유무로만 판별한다 */
export const hasAudioStreamResolver = (): boolean => {
  const native = getNative();
  return typeof native?.setStreamUrl === 'function' && typeof native.clearStreamUrl === 'function';
};

/**
 * 플레이어 하나의 고정 주소. 키는 URL 호스트 자리라 소문자·숫자·하이픈만 남긴다(네이티브도 호스트를 소문자로 읽는다).
 * 재발행 교체마다 새 키를 쓴다 — 옛 아이템의 남은 요청이 새 음원 URL 을 집지 않게
 */
export const createStreamUri = (contentId: string, sequence: number): string => {
  const safeId = contentId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${STREAM_SCHEME}://${safeId}-${sequence}`;
};

/** 다음 바이트 요청부터 쓸 서명 URL 을 넘긴다. 실패하면 false — 호출부가 `replace` 로 폴백한다 */
export const setStreamUrl = (streamUri: string, url: string): boolean => {
  const native = getNative();
  if (typeof native?.setStreamUrl !== 'function') return false;
  try {
    native.setStreamUrl(streamUri, url);
    return true;
  } catch (error) {
    logger.warn('[player] stream url update failed', error);
    return false;
  }
};

/** 플레이어를 내릴 때 표에서 지운다 — 서명 URL 을 필요 이상 들고 있지 않는다 */
export const clearStreamUrl = (streamUri: string): void => {
  const native = getNative();
  if (typeof native?.clearStreamUrl !== 'function') return;
  try {
    native.clearStreamUrl(streamUri);
  } catch (error) {
    logger.debug('[player] stream url clear failed', error);
  }
};
