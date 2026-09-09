/**
 * 1단계 주제 목록의 표시 상태 판정(onboarding.md 7 · onboarding-api.md 4.2).
 *
 * **빈 목록을 조회 실패와 같은 층으로 다룬다.** 서버는 노출 주제가 0건이면 폴백을 만들지 않고
 * `items: []`를 200으로 내려준다(BE `fix(be)/audit-followups-0909` — 폴백 목록은 저장 API가
 * 같은 `is_visible`로 거부해 [다음]에서 400이 나던, 빠져나갈 수 없는 화면이었다).
 *
 * 200이라 `isError`가 false이므로, 이 판정이 없으면 화면은 마퀴가 텅 빈 채 [다음]도 비활성이고
 * 1단계에는 [건너뛰기]가 없어 **앱을 껐다 켜도 같은 화면으로 돌아온다.**
 */
export interface TopicListState {
  /** 첫 조회 진행 중 — 스켈레톤(O5) */
  isPending: boolean;
  /** 조회 실패(5xx·타임아웃 등) */
  isError: boolean;
  /** 내려받은 주제 개수 */
  topicCount: number;
}

/**
 * 전체 화면 에러 + [다시 시도]를 그려야 하는가. 조회 실패와 "응답은 정상인데 주제가 0건"을
 * 함께 참으로 판정한다 — 사용자가 할 수 있는 일이 [다시 시도] 하나로 같기 때문이다.
 * 운영 알림은 서버가 이미 올리므로 화면은 재시도만 제공한다.
 */
export const isTopicListUnavailable = ({
  isPending,
  isError,
  topicCount,
}: TopicListState): boolean => {
  // 조회 중에는 아직 판정하지 않는다 — 0건은 "비어 있음"이 아니라 "아직 모름"이다
  if (isPending) return false;
  return isError || topicCount === 0;
};
