/**
 * 리뷰를 가져오는 스토어 — `store_reviews.store`.
 *
 * 값은 `SubscriptionStore`와 같은 철자지만 **따로 선언한다** — 결제 모듈의 enum을 끌어오면 VoC가 결제에
 * 의존하게 된다(architecture.md 모듈 경계). 두 enum이 같은 뜻을 가리키는 것은 우연이 아니라 스토어가 둘뿐이라서다.
 */
export enum ReviewStore {
  APP_STORE = 'app_store',
  PLAY_STORE = 'play_store',
}
