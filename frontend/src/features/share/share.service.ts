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
  /** null·빈 값이면 텍스트에 저자 줄 없이 출처만 싣는다 — "저자 없음"으로 채우지 않는다(share.md 4.1) */
  authorName: string | null;
  sourceName: string;
}

/**
 * 공유 텍스트 조립 — 제목 / 저자 · 출처 / 링크 세 줄.
 * TODO(카피): 줄바꿈·구분자·순서는 미확정이다(share-uiux.md 6장 — 시안 SH3의 세 줄 제안을
 * 따른다. P1 활성화 시 확정). 내부 용어·링크 안내 문구를 덧붙이지 않는다(uiux 6장).
 */
export const buildShareMessage = (input: ShareContentInput): string => {
  const byline = input.authorName
    ? `${input.authorName} · ${input.sourceName}`
    : input.sourceName;
  return [input.title, byline, buildShareLink(input.contentId)].join('\n');
};

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
