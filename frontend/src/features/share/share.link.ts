/**
 * 공유 링크(share.md 4.2) — 해당 콘텐츠의 상세 화면으로 연결되는 링크 하나다.
 * `content_id` 외의 값(보낸 사용자 식별자·토큰·캠페인 파라미터)을 싣지 않는다 —
 * 수신자의 조회 스코프는 언제나 수신자 자신의 토큰이 정한다.
 *
 * 형태: https://earcast.co.kr/contents/:id (유니버설 링크/App Links — 도메인 확보 2026-08-25).
 * 앱 미설치 수신자는 같은 URL이 웹(스토어 리다이렉트)으로 처리한다 — 링크 하나로 폴백이 성립한다.
 */

const SHARE_LINK_BASE = 'https://earcast.co.kr/contents/';

/**
 * 수신 URL 판별 — 우리 도메인의 /contents/:id 만 공유 링크다. https 외 스킴·다른 host·
 * 다른 경로는 전부 null. RN(Hermes) 환경의 URL 생성자 편차를 피해 정규식으로 파싱한다.
 */
const SHARE_LINK_PATTERN = /^https:\/\/earcast\.co\.kr\/contents\/([^/?#]+)/;

export const buildShareLink = (contentId: string): string => `${SHARE_LINK_BASE}${contentId}`;

/** 공유 링크면 content_id를, 아니면 null을 돌려준다 — 아닌 URL은 게이트가 무시한다 */
export const parseShareLink = (url: string): string | null => {
  const match = SHARE_LINK_PATTERN.exec(url);
  return match ? match[1] : null;
};
