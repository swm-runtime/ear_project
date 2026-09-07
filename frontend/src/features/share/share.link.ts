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
 * 수신 URL 판별 — 두 형태만 공유 링크다. 다른 host·다른 경로는 전부 null.
 * RN(Hermes) 환경의 URL 생성자 편차를 피해 정규식으로 파싱한다.
 *
 * | 형태 | 언제 |
 * |---|---|
 * | `https://earcast.co.kr/contents/:id` | 유니버설 링크·App Links (기본) |
 * | `ear://contents/:id` | **인앱 브라우저 탈출용** (아래) |
 *
 * **커스텀 스킴을 받는 이유** — 카카오톡은 링크를 인앱 브라우저로 여는데, 인앱 브라우저는
 * OS 링크 검증을 타지 않아 앱이 설치돼 있어도 넘어오지 않는다. 랜딩 안내 페이지의
 * [앱에서 열기]가 이 스킴으로 앱을 띄운다(`tickets/frontend/pending/share-link-in-app-browser-escape.md`).
 * 공유의 주 경로가 카톡이라 이 경로가 없으면 실제 도달률이 낮다.
 *
 * **보안 관점의 변화는 없다.** 링크에 실리는 값은 `content_id` 하나이고, 수신자의 조회
 * 스코프는 언제나 수신자 자신의 토큰이 정한다(위 주석).
 */
const SHARE_LINK_PATTERNS = [
  /^https:\/\/earcast\.co\.kr\/contents\/([^/?#]+)/,
  /^ear:\/\/contents\/([^/?#]+)/,
] as const;

export const buildShareLink = (contentId: string): string => `${SHARE_LINK_BASE}${contentId}`;

/** 공유 링크면 content_id를, 아니면 null을 돌려준다 — 아닌 URL은 게이트가 무시한다 */
export const parseShareLink = (url: string): string | null => {
  for (const pattern of SHARE_LINK_PATTERNS) {
    const match = pattern.exec(url);
    if (match) return match[1];
  }
  return null;
};
