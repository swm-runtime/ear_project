/**
 * 주제 목록의 표시 상태 판정(onboarding.md 7 · onboarding-api.md 4.2).
 *
 * **빈 목록을 조회 실패와 같은 층으로 다룬다.** 서버는 노출 주제가 0건이면 폴백을 만들지 않고
 * `items: []`를 200으로 내려준다(BE `fix(be)/audit-followups-0909` — 폴백 목록은 저장 API가
 * 같은 `is_visible`로 거부해 [다음]에서 400이 나던, 빠져나갈 수 없는 화면이었다).
 *
 * 200이라 `isError`가 false이므로, 이 판정이 없으면 온보딩 1단계는 마퀴가 텅 빈 채 [다음]도
 * 비활성이고 [건너뛰기]도 없어 **앱을 껐다 켜도 같은 화면으로 돌아온다.**
 *
 * **판정이 interest에 있는 이유** — 주제 목록의 소유자가 이 feature다(계약·캐시·`useTopicsQuery`·
 * `TopicChip`). 온보딩 1단계와 관심사 관리가 같은 엔드포인트를 쓰므로 판정도 하나여야 하는데,
 * `architecture.md` 4.4의 방향은 `onboarding → interest` 한쪽뿐이라 반대로 두면 순환이 된다.
 * `shared/`(api·hooks·lib·storage·theme·ui)는 횡단 인프라 층이라 특정 목록의 도메인 판정 자리가
 * 아니다 — 거기 두면 주제 목록 지식이 두 층으로 흩어진다.
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
 *
 * **재조회 여부도 이 판정으로 정한다.** 0건은 성공 상태(200)라 `isError`만 보고 재조회하면
 * [다시 시도]가 아무 요청도 보내지 않는 죽은 버튼이 된다.
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
