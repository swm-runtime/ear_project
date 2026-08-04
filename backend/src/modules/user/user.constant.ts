import { ConsentType } from './user.enum';

/**
 * 현행 약관 버전. 동의 화면에 보여줄 버전을 서버가 내려주고,
 * 재동의 판정도 이 값과 `consents` 최신 행을 비교해서 한다 (auth-api.md 4.1).
 *
 * TODO(팀 확정): 실제 약관·개인정보 처리방침 버전 문자열. 문서에 값이 정해져 있지 않아 1.0으로 시작한다.
 */
export const CURRENT_CONSENT_VERSIONS: Readonly<
  Record<ConsentType, string | null>
> = {
  [ConsentType.TERMS]: '1.0',
  [ConsentType.PRIVACY]: '1.0',
  /** 마케팅 동의는 버전이 없다 (domain.md 3.2) */
  [ConsentType.MARKETING]: null,
};

/** 계정 생성에 반드시 필요한 동의 (auth.md 4.1) */
export const REQUIRED_CONSENT_TYPES: readonly ConsentType[] = [
  ConsentType.TERMS,
  ConsentType.PRIVACY,
];

// --- 이메일 인증 코드 규칙 (auth.md 4.5) ---

/** 6자리 숫자 */
export const EMAIL_VERIFICATION_CODE_LENGTH = 6;
/** 코드 유효 시간 3분 — 발송 시각 기준 */
export const EMAIL_VERIFICATION_CODE_TTL_SEC = 180;
/** 재발송 쿨다운 30초 */
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC = 30;
/** 이메일 주소당 발송 5회 */
export const EMAIL_VERIFICATION_SEND_LIMIT = 5;
/** 5회 소진 시점으로부터 1시간 뒤 창이 초기화된다 */
export const EMAIL_VERIFICATION_SEND_WINDOW_SEC = 3600;
/** 코드당 검증 시도 5회 */
export const EMAIL_VERIFICATION_ATTEMPT_LIMIT = 5;
/**
 * 이메일 인증 응답의 최소 처리 시간(ms).
 * 존재 여부·검증 결과가 응답 시간으로 새지 않게 한다 (auth.md 4.5).
 */
export const EMAIL_VERIFICATION_MIN_RESPONSE_MS = 150;

/** 아카이브·탈퇴 로그 해시 버전 (domain.md 11.2 — 키 교체 시에만 올린다) */
export const USER_HASH_VERSION = 1;
