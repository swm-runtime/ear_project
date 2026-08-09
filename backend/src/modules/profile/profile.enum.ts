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
