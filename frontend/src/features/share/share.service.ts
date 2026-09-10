import { Share } from 'react-native';

import { logger } from '@/shared/lib/logger';

import { buildShareLink } from './share.link';

/**
 * 공유 실행(share.md 4.1) — OS 표준 공유 시트에 텍스트+링크를 전달하는 것이 전부다.
 * 조립은 진입점 화면이 이미 들고 있는 응답 값으로 하고, 서버 엔드포인트는 없다(P1에도).
 */
export interface ShareContentInput {
  contentId: string;
  title: string;
}

/**
 * 공유 텍스트 조립 — **제목 / 링크 두 줄로 확정**(2026-09-10, 팀장 결정 A안.
 * 티켓 `tickets/frontend/archive/share-message-final-copy.md`).
 *
 * 종전의 둘째 줄 `저자 · 출처`(상세의 "참고한 자료")는 **싣지 않는다.** 링크를 열면 상세에서
 * 어차피 보이고, 출처 문구가 길면 메시지 앱에서 링크 미리보기보다 텍스트가 먼저 잘린다.
 * 그래서 `authorName`·`sourceName`을 입력으로도 받지 않는다 — 쓰지 않는 값을 계속 모으면
 * 다음 사람이 왜 필요한지 되짚게 된다.
 *
 * 내부 용어·링크 안내 문구를 덧붙이지 않는다(uiux 6장).
 */
export const buildShareMessage = (input: ShareContentInput): string =>
  [input.title, buildShareLink(input.contentId)].join('\n');

/**
 * OS 공유 시트 열기 — 시트의 모양·대상 목록은 OS 소유다(share.md 4.1). 전송·취소 어느 쪽에도
 * 후속 동작이 없다(share.md 4.4 — 공유는 신호가 아니고, OS는 완료 여부를 신뢰할 수 있게
 * 알려주지 않는다). 시트를 열지 못한 실패만 디버그 로그로 남긴다.
 */
export const shareContent = async (input: ShareContentInput): Promise<void> => {
  try {
    await Share.share({ message: buildShareMessage(input) });
  } catch (error) {
    logger.debug('[share] open share sheet failed', error);
  }
};
