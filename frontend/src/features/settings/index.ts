/**
 * settings feature 공개 API(convention.md 2.2) — 여기서 export하지 않은 것은 내부 구현이다.
 * 다른 feature·app은 이 파일을 통해서만 settings에 접근한다.
 *
 * settingsKeys는 하위 화면들과의 갱신 계약이다(profile과 같은 방식):
 * 이메일 인증·구독 관리·관심사 관리 화면은 저장(변경)에 성공했을 때만
 * `queryClient.invalidateQueries({ queryKey: settingsKeys.summary() })`를 호출한다.
 * 설정은 화면이 살아 있는 동안의 invalidate와 focus 복귀 재조회를 조용한 갱신으로 처리한다.
 */
export { default as SettingsScreen } from './screens/SettingsScreen';
export { settingsKeys } from './api/settings.api';
