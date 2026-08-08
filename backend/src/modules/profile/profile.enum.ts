/**
 * profile-api.md 4.1 — 플랜 카드가 그려야 할 **4분기로 정규화한 값**이다.
 *
 * `subscriptions.status` enum을 그대로 내려주지 않는 이유는, 화면이 필요한 분기가
 * raw 상태와 1:1이 아니기 때문이다. 해지 예약은 `status = active` + `is_auto_renew = false`
 * 조합이라 raw 값을 내려주면 **판정이 클라이언트마다 재작성된다** — 판정은 서버가 한다.
 *
 * 이 enum은 설정 화면의 구독 요약(`settings-api.md`)과 구독 관리 화면도 그대로 쓰게 되며,
 * `subscription.md`의 API 명세가 작성되면 소유가 그쪽으로 옮겨간다(`profile-api.md` 9장).
 */
export enum PlanStatus {
  /** 유효한 구독 행 없음 — 행 자체가 없거나 `expired` · `refunded`뿐 */
  FREE = 'free',
  /** `active` + 자동 갱신 → 다음 결제일을 보여준다 */
  SUBSCRIBED = 'subscribed',
  /** 해지 예약 — 만료 전이지만 자동 갱신이 꺼졌다. 이용 종료일을 보여준다 */
  CANCEL_SCHEDULED = 'cancel_scheduled',
  /** 결제 실패 유예 — 플랜명 + 경고 */
  GRACE = 'grace',
}

/**
 * profile-api.md 4.1 `failed_sections` — **부분 실패를 표현하는 키**다.
 *
 * 한 섹션의 조회 실패가 응답 전체를 5xx로 만들지 않는다(`profile.md` 4.8 —
 * "구독 조회만 실패하면 플랜 카드만 에러로 두고 나머지는 정상 노출한다").
 *
 * **`stats` 하나가 통계 3영역을 묶는다.** 화면이 통계를 한 영역으로 실패 처리하므로
 * 요약·주간 그래프·주제 분포를 따로 가르지 않는다.
 *
 * **`user`·`career`는 대상이 아니다.** 둘 다 같은 `users` 행에서 오므로 함께 성공·실패하고,
 * 자기 계정 행 조회가 실패하는 상황은 사실상 인증 실패라 요청 전체가 실패한다.
 */
export enum ProfileSection {
  PLAN = 'plan',
  INTEREST_SUMMARY = 'interest_summary',
  STATS = 'stats',
}
