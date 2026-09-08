import * as Updates from 'expo-updates';

/**
 * 앱 버전 문자열 — 기기 동기화(onboarding-api.md 4.9)·설정 조회(settings-api.md 4.1)가 함께 쓴다.
 * 업데이트 여부 판정은 서버가 한다(settings-api.md 4.1) — 이 값으로 비교하지 않는다.
 * TODO: expo-constants 도입 후 app.json version과 연결한다.
 */
export const APP_VERSION = '1.0.0';

/**
 * **지금 실행 중인 JS 번들의 식별자** — 화면 표시 전용이다.
 *
 * OTA는 받은 즉시 적용되지 않는다. 앱은 옛 번들로 뜨고 새 번들을 백그라운드로 받아
 * **다음 실행**에 적용한다(`fallbackToCacheTimeout` 기본값 0). 그래서 한 번 껐다 켜는
 * 것만으로는 옛 코드가 계속 돌고, 그 상태로 검증하면 **고친 것이 안 고쳐진 것처럼 보인다**
 * (2026-09-08 — 회수 중단이 "안 된다"의 실제 원인이 이것이었다).
 *
 * 눈으로 구분할 값이 없으면 매번 같은 함정을 밟는다. 스토어 빌드에 내장된 번들이면 `내장`,
 * OTA로 받은 번들이면 업데이트 ID 앞 6자리를 보여준다.
 *
 * **서버 판정에 쓰지 않는다** — 업데이트 안내는 서버가 `APP_VERSION`으로 정한다.
 */
const resolveBundleLabel = (): string => {
  try {
    // 웹·개발 빌드에선 모듈이 값을 주지 않는다 — 표시용이므로 조용히 비운다
    if (Updates.isEmbeddedLaunch) return '내장';
    const updateId = Updates.updateId;
    return updateId ? updateId.replace(/-/g, '').slice(0, 6) : '내장';
  } catch {
    return '내장';
  }
};

/** 설정 화면의 버전 행에 붙는 값 — `1.0.0 (a07fe5)` 꼴 */
export const APP_VERSION_LABEL = `${APP_VERSION} (${resolveBundleLabel()})`;
