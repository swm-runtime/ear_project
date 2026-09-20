import { Platform } from 'react-native';

/**
 * 알림 feature의 서버 통신 대역 전환. 기기 동기화(PUT /users/me/devices/:device_id)가
 * onboarding에서 이곳으로 이관됐다(architecture.md 4.4 — settings·onboarding이 함께 쓴다).
 * 백엔드 실서버로 붙일 때는 EXPO_PUBLIC_NOTIFICATION_API=real 로 전환한다
 * (기존에 onboarding 플래그가 겸하던 구간이므로 onboarding 실서버 테스트 시 함께 켠다).
 */
export const IS_NOTIFICATION_API_MOCKED =
  __DEV__ && process.env.EXPO_PUBLIC_NOTIFICATION_API !== 'real';

/**
 * OS 권한 스텁의 초기 상태 시나리오(EXPO_PUBLIC_NOTIFICATION_MOCK_SCENARIO):
 * - (기본)                미결정 — 설정의 유도 배너 노출·온보딩 사전 안내 경로
 * - permission-granted    허용됨 — 배너 숨김·토글 즉시 저장, 온보딩 O10·O11 건너뛰기
 * - permission-denied     거부됨 — 토글 ON 시도 시 기기 설정 안내(S4)
 */
export const NOTIFICATION_MOCK_SCENARIO =
  process.env.EXPO_PUBLIC_NOTIFICATION_MOCK_SCENARIO ?? 'default';

/**
 * OS 권한·토큰을 스텁으로 돌리는가. 웹에는 푸시가 없고, mock 개발 실행(Expo Go·시뮬레이터)은
 * 토큰 발급이 실패한다 — 그 둘만 스텁이다. **운영 빌드는 항상 실제 SDK를 탄다**
 * (`__DEV__`가 false면 `IS_NOTIFICATION_API_MOCKED`도 false다).
 */
export const IS_OS_PERMISSION_STUBBED = Platform.OS === 'web' || IS_NOTIFICATION_API_MOCKED;

/**
 * Android 기본 채널. 서버가 채널을 지정하지 않으면 Expo Push는 `default` 채널로 보낸다 —
 * 같은 id로 미리 만들어 둬야 Android 13+ 권한 다이얼로그가 뜨고 표시 이름을 우리가 정한다.
 */
export const ANDROID_DEFAULT_CHANNEL_ID = 'default';

/** 서버 페이로드의 `data.type`(notification.md 3장) — MVP는 이 하나다 */
export const PUSH_TYPE_DRIP_ARRIVAL = 'drip_arrival';

/** 인앱 배너 노출 시간 — 토스트(3초)보다 길게 둔다: 탭해서 이동할 시간이 필요하다 */
export const ARRIVAL_BANNER_DURATION_MS = 5000;
