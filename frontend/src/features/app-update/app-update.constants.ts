/**
 * 버전 관문 API mock — 설정과 같은 규칙(`settings.constants.ts`): 개발 빌드에서는 켜는 쪽이 기본이고
 * `EXPO_PUBLIC_APP_VERSION_API=real` 로 끈다. 시나리오는 `app-version.mock.ts`
 */
export const IS_APP_VERSION_API_MOCKED = __DEV__ && process.env.EXPO_PUBLIC_APP_VERSION_API !== 'real';

/**
 * 관문 조회 타임아웃 — 일반 요청(10초)보다 짧다(KAN-99 할 일 4). 실패는 막지 않으므로(fail-open) 오래 기다릴
 * 이유가 없고, 스플래시 로고 모션(약 3초) 안에 끝나야 체감이 없다
 */
export const VERSION_GATE_TIMEOUT_MS = 3_000;

/**
 * 백그라운드에 이만큼 머문 뒤 포그라운드로 돌아오면 버전 체크만 다시 한다(`splash.md` 2장 — 화면 분기는 하지 않는다,
 * 단 최소 지원 미만이면 강제 업데이트 화면은 뜬다). 마지막 탭 복원(4-1)과 같은 30분
 */
export const RECHECK_AFTER_BACKGROUND_MS = 30 * 60 * 1_000;
