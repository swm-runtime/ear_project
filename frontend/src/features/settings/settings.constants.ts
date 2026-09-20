import { Platform } from 'react-native';

/**
 * 백엔드 준비 후 실서버로 붙일 때는 EXPO_PUBLIC_SETTINGS_API=real 로 전환한다.
 */
export const IS_SETTINGS_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_SETTINGS_API !== 'real';

/**
 * 외부 목적지 URL — 원천은 배포 설정이다(settings-api.md 1장 경계 표: 서버 엔드포인트가 없다).
 *
 * **폴백을 실값으로 둔다.** 예전 폴백은 `ear.example.com`(존재하지 않는 도메인)이었고
 * eas.json 에 값이 없어, 스토어 빌드의 [이용약관]·[개인정보처리방침]·[업데이트]가 전부
 * 죽은 링크로 나갔다. env 누락이 조용히 사고가 되지 않게 폴백 자체를 실값으로 맞춘다
 * (공유 플래그를 기본 켬으로 둔 것과 같은 이유 — share.constants.ts).
 */
/**
 * 문의 목적지 — **채널 홈이 아니라 `/chat`이다.** 홈으로 보내면 사용자가 [채팅하기]를 한 번
 * 더 눌러야 하는데, 인증된 이메일의 변경 요청이 이 경로 하나뿐이라(`auth.md` 4.4) 단계를
 * 늘리지 않는다. 카카오가 안내하는 `http://` 주소는 `https://`로 리다이렉트되므로 처음부터
 * `https`로 둔다.
 */
export const KAKAO_CHANNEL_URL =
  process.env.EXPO_PUBLIC_KAKAO_CHANNEL_URL ?? 'https://pf.kakao.com/_MdkJX/chat';
export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://earcast.co.kr/terms';
export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? 'https://earcast.co.kr/privacy';
/**
 * [업데이트] 버튼의 목적지 — **플랫폼마다 스토어가 다르다.**
 *
 * 한쪽 값만 두면 반대 플랫폼 사용자가 남의 스토어로 간다. iOS 앱이 심사를 통과한 지금
 * Play 고정값을 그대로 두면 iOS 사용자가 Play 로 떨어진다 — 이 파일이 폴백을 실값으로
 * 두는 이유(env 누락이 조용히 사고가 되지 않게)와 같은 종류의 사고다.
 *
 * iOS 앱 ID 는 `frontend/eas.json` 의 `submit.production.ios.ascAppId` 와 같은 값이다.
 * 스토어 게시 전에는 어느 쪽이든 "찾을 수 없음"을 보여준다 — [업데이트] 는 서버가 강제
 * 업데이트를 지시할 때만 뜨고 그 시점은 게시 이후다.
 */
const IOS_STORE_URL = 'https://apps.apple.com/app/id6807708636';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.runtime.ear';
export const STORE_URL =
  process.env.EXPO_PUBLIC_STORE_URL ??
  (Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL);
