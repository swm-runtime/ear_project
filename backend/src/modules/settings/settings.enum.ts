/**
 * settings-api.md 4.1 `failed_sections` — **부분 실패를 표현하는 키**다.
 *
 * 조회가 실패해도 서버 값이 필요 없는 메뉴(약관·로그아웃 등)는 동작해야 하므로,
 * `profile-api.md` 4.1과 같은 방식으로 섹션 단위 실패를 흡수한다(3장 설계 메모).
 *
 * **`settings` · `marketing_consent` · `version`은 대상이 아니다.** 토글 기준값이 없으면
 * 낙관적 UI를 시작할 수 없어, 그 셋이 실패하면 응답 전체가 실패한다(4.1).
 */
export enum SettingsSection {
  ACCOUNT = 'account',
  PLAN = 'plan',
  INTEREST_SUMMARY = 'interest_summary',
}
