import { ReviewStore } from './voc.enum';

/**
 * 두 스토어의 리뷰를 같은 모양으로 정규화한 것 — 폴링 서비스·메시지 포맷은 이 모양만 안다.
 *
 * **리뷰어 닉네임은 어디에도 없다.** App Store의 `reviewerNickname`, Play의 `authorName`은 클라이언트가
 * 응답을 읽을 때 버린다(CLAUDE.md 공통 원칙 — 신원 값을 Slack·DB·로그에 옮기지 않는다).
 */
export interface StoreReviewItem {
  store: ReviewStore;
  /** 스토어가 매긴 리뷰 식별자 — `store_reviews.review_id` */
  reviewId: string;
  /** 별점 1~5 */
  rating: number;
  /** App Store만 제목이 있다. Play는 항상 null */
  title: string | null;
  /** 본문 원문(자르지 않는다 — 500자 절단은 메시지 포맷의 몫) */
  body: string;
  /** 작성 또는 마지막 수정 시각 — 이 값이 커지면 "수정됨"으로 다시 알린다 */
  lastModifiedAt: Date;
  /** 리뷰가 달린 앱 버전. Play는 `appVersionName`, App Store는 응답에 없어 null */
  appVersion: string | null;
  /** App Store는 국가 코드(`territory`), Play는 리뷰어 언어(`reviewerLanguage`). 없으면 null */
  territoryOrLanguage: string | null;
}

/** HTTP 상태로 가른 실패 종류 — 로그 레벨과 "다음 주기에 될 것인가"를 정한다 */
export type StoreReviewFailureKind =
  /** 401·403 — 자격증명·권한 문제. 재시도로 풀리지 않으니 사람이 봐야 한다(error) */
  | 'credential'
  /** 429·5xx·네트워크 — 다음 주기에 다시 하면 된다(warn) */
  | 'transient'
  /** 그 밖의 4xx·형식 오류 — 코드나 설정이 틀렸다(error) */
  | 'unexpected';

/** 상태 코드 → 실패 종류. 응답이 없었으면(`null`) 네트워크 문제로 보고 일시 실패로 다룬다 */
export function classifyHttpStatus(
  status: number | null,
): StoreReviewFailureKind {
  if (status === null || status === 429 || status >= 500) {
    return 'transient';
  }

  if (status === 401 || status === 403) {
    return 'credential';
  }

  return 'unexpected';
}

/** 스토어 리뷰 조회 실패 — 클라이언트가 던지고 폴링 서비스가 종류별로 로그를 남긴다. 본문·닉네임을 싣지 않는다 */
export class StoreReviewFetchError extends Error {
  readonly kind: StoreReviewFailureKind;

  constructor(
    readonly store: ReviewStore,
    readonly status: number | null,
  ) {
    super(`${store} review fetch failed (${status ?? 'no response'})`);
    this.name = 'StoreReviewFetchError';
    this.kind = classifyHttpStatus(status);
  }
}
