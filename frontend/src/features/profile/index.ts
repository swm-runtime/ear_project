/**
 * profile feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 profile에 접근한다.
 *
 * profileKeys는 편집 화면들과의 갱신 계약이다(profile.md 4.4 · profile-uiux.md 4.9):
 * 관심사 관리·커리어 정보·이메일 인증·구독 관리 화면은 **저장(변경)에 성공했을 때만**
 * `queryClient.invalidateQueries({ queryKey: profileKeys.summary() })`를 호출한다.
 * 프로필은 화면이 살아 있는 동안의 invalidate를 스켈레톤 없이 조용한 재조회로 처리하므로,
 * [취소]·뒤로가기 복귀에는 아무것도 호출하지 않는 것이 곧 "재조회하지 않는다"가 된다.
 */
export { default as ProfileScreen } from './screens/ProfileScreen';
export { profileKeys } from './api/profile.api';
