import { escapeSlackText } from '@/modules/alert/slack-alert.service';

import { REVIEW_BODY_MAX_LENGTH } from './voc.constant';
import { ReviewStore } from './voc.enum';
import { StoreReviewItem } from './voc.types';

/**
 * 스토어 리뷰 Slack 문구 — **순수 함수만 둔다.** 조회·판정은 서비스가 하고, 여기서는 받은 리뷰를 사람이 읽는
 * 줄로 바꾼다. 입력 모양(`StoreReviewItem`)에 닉네임 자체가 없으므로 문구에도 들어갈 길이 없다.
 */

/** 한 메시지에 실을 리뷰 — 수정된 리뷰는 이전 별점을 함께 받아 변화를 적는다 */
export interface ReviewNotice {
  review: StoreReviewItem;
  /** 이미 알린 리뷰가 수정됐으면 그때의 별점, 새 리뷰면 null */
  previousRating: number | null;
}

const STORE_LABEL: Readonly<Record<ReviewStore, string>> = {
  [ReviewStore.APP_STORE]: 'App Store',
  [ReviewStore.PLAY_STORE]: 'Google Play',
};

/** 수정 시각을 `MM/DD`(KST)로 — 채널에서 날짜만 보면 되고, 연도는 거의 늘 올해다 */
function formatDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('month')}/${pick('day')}`;
}

/** 본문을 상한에서 자른다 — 넘치면 말줄임표를 붙여 잘렸음을 보인다 */
export function truncateBody(
  body: string,
  maxLength = REVIEW_BODY_MAX_LENGTH,
): string {
  const chars = [...body];

  return chars.length > maxLength
    ? `${chars.slice(0, maxLength).join('')}…`
    : body;
}

/**
 * 인용 블록 — 줄마다 `> `를 붙여 Slack이 한 덩어리로 보이게 한다.
 *
 * **리뷰어가 쓴 글이라 Slack 제어 문자를 무력화한다**(`escapeSlackText`). 리뷰에 `<!channel>`을 쓰면 채널 전체가
 * 호출되고 `<주소|글자>`는 위장 링크가 된다 — 스토어 리뷰는 누구나 쓸 수 있다. 인용 기호를 붙이기 **전에** 바꾼다.
 */
function quote(text: string): string {
  return escapeSlackText(text)
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

/**
 * 리뷰 한 건:
 * ```
 * :star: 4/5 · App Store · v1.2.0 · KR · 10/06 (수정됨 3→4)
 * > 제목
 * > 본문
 * ```
 * 버전·국가가 없으면 그 칸을 뺀다(App Store 응답에는 버전이 없다).
 */
export function formatReviewNotice(notice: ReviewNotice): string {
  const { review, previousRating } = notice;
  const headline = [
    `:star: ${review.rating}/5`,
    STORE_LABEL[review.store],
    // 스토어가 준 값이지만 우리가 만든 문자열이 아니다 — 같이 무력화한다
    review.appVersion ? `v${escapeSlackText(review.appVersion)}` : null,
    review.territoryOrLanguage
      ? escapeSlackText(review.territoryOrLanguage)
      : null,
    formatDate(review.lastModifiedAt),
  ]
    .filter((segment): segment is string => segment !== null)
    .join(' · ');
  const editedMark =
    previousRating === null
      ? ''
      : previousRating === review.rating
        ? ' (수정됨)'
        : ` (수정됨 ${previousRating}→${review.rating})`;
  const lines = [`${headline}${editedMark}`];

  if (review.title) {
    lines.push(quote(review.title));
  }

  if (review.body) {
    lines.push(quote(truncateBody(review.body)));
  }

  return lines.join('\n');
}

/**
 * 한 주기의 알림을 **한 메시지로 묶는다** — 웹훅이 1건/초라 건마다 보내면 밀린다.
 * 첫 줄에 건수를 적어 채널에서 "리뷰 알림"임을 바로 알게 한다.
 */
export function formatReviewDigest(notices: ReviewNotice[]): string {
  const header = `:speech_balloon: 스토어 리뷰 ${notices.length}건`;

  return [header, ...notices.map(formatReviewNotice)].join('\n\n');
}
