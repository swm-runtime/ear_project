import * as Updates from 'expo-updates';

/**
 * 앱 버전 문자열 — 기기 동기화(onboarding-api.md 4.9)·설정 조회(settings-api.md 4.1)가 함께 쓴다.
 * 업데이트 여부 판정은 서버가 한다(settings-api.md 4.1) — 이 값으로 비교하지 않는다.
 * TODO: expo-constants 도입 후 app.json version과 연결한다.
 */
export const APP_VERSION = '1.1.0';

/**
 * **지금 실행 중인 JS 번들의 식별자** — 화면 표시 전용이다.
 *
 * OTA는 받은 즉시 적용되지 않는다. 앱은 옛 번들로 뜨고 새 번들을 백그라운드로 받아
 * **다음 실행**에 적용한다(`fallbackToCacheTimeout` 기본값 0). 그래서 한 번 껐다 켜는
 * 것만으로는 옛 코드가 계속 돌고, 그 상태로 검증하면 **고친 것이 안 고쳐진 것처럼 보인다**
 * (2026-09-08 — 회수 중단이 "안 된다"의 실제 원인이 이것이었다).
 *
 * 눈으로 구분할 값이 없으면 매번 같은 함정을 밟는다. 스토어 빌드에 내장된 번들이면 `내장`,
 * OTA로 받은 번들이면 업데이트 ID 앞 8자리를 보여준다.
 *
 * **6자리로는 같은 날 발행분이 구분되지 않는다.** 업데이트 ID는 UUIDv7이고 앞부분이
 * 발행 시각(ms)이라, 6자리는 시각의 상위 24비트 — **약 4.6시간이 같은 값으로 뭉친다.**
 * 실제로 18분 간격의 두 발행이 똑같이 `01a0a3`으로 보여, 옛 번들을 새 번들로 착각한 채
 * "안 고쳐졌다"를 확인했다(2026-09-15). 8자리면 약 1분까지 갈라진다.
 *
 * **서버 판정에 쓰지 않는다** — 업데이트 안내는 서버가 `APP_VERSION`으로 정한다.
 */
const BUNDLE_LABEL_LENGTH = 8;

const resolveBundleLabel = (): string => {
  try {
    // 웹·개발 빌드에선 모듈이 값을 주지 않는다 — 표시용이므로 조용히 비운다
    if (Updates.isEmbeddedLaunch) return '내장';
    const updateId = Updates.updateId;
    return updateId ? updateId.replace(/-/g, '').slice(0, BUNDLE_LABEL_LENGTH) : '내장';
  } catch {
    return '내장';
  }
};

/**
 * **개발계 API 를 보는 앱인가** — 화면 표시 전용이다.
 *
 * preview 앱(내부 APK·ad-hoc)과 스토어 앱은 번들 ID 가 같아 홈 화면에서 구분되지 않는다.
 * 어느 쪽을 깔았는지 모르면 개발계에서 확인할 것을 운영에서 보고 "안 고쳐졌다"고 착각한다.
 * 채널이 아니라 **실제로 부르는 주소**로 가른다 — preview OTA·빌드는 이 값에 개발계 주소를
 * 싣고(`eas-update.yml`·`eas.json` preview), 운영은 값이 없거나 운영 주소다(api-client.ts).
 */
export const IS_DEV_API = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').includes('://api-dev.');

/** 설정 화면의 버전 행에 붙는 값 — `1.1.0 (01a0a3c9)` 꼴, 개발계면 `1.1.0 (01a0a3c9) · 개발계` */
export const APP_VERSION_LABEL = `${APP_VERSION} (${resolveBundleLabel()})${IS_DEV_API ? ' · 개발계' : ''}`;
