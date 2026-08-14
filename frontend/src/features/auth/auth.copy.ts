import type { ConsentType, SocialProvider } from './auth.types';

/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 auth-uiux.md와 1:1 대조한다.
 * TODO 표시 항목은 uiux 문서에 확정 카피가 없어 임시로 둔 것 — 확정 시 교체한다.
 */
export const AUTH_COPY = {
  start: {
    /* TODO(카피 미확정): 시작 화면 서비스 소개 문구 */
    /** 로고 이미지의 대체 텍스트 — 화면에 글자로는 보이지 않는다 */
    appName: '이어',
    tagline: "당신의 귀를 '이어'주다",
    description: '매일 출근길에 도착하는 나만의 팟캐스트',
    termsLink: '이용약관',
    privacyLink: '개인정보 처리방침',
    provider: {
      kakao: '카카오로 시작하기',
      naver: '네이버로 시작하기',
      google: 'Google로 시작하기',
      apple: 'Apple로 시작하기',
    } satisfies Record<SocialProvider, string>,
    /** 제공자 버튼 묶음 위에 붙는 구분선 문구 */
    providerSectionLabel: '소셜로그인으로 시작하기',
  },
  /** auth-uiux.md 4.2 — 확정 카피 */
  loginFailed: '로그인에 실패했어요. 다시 시도해주세요',
  consent: {
    /* TODO(카피 미확정): 약관 동의 화면 타이틀 */
    title: '서비스 이용을 위해\n동의가 필요해요',
    agreeAll: '전체 동의',
    label: {
      terms: '이용약관 동의',
      privacy: '개인정보 처리방침 동의',
      marketing: '마케팅 정보 수신 동의',
    } satisfies Record<ConsentType, string>,
    requiredTag: '(필수)',
    optionalTag: '(선택)',
    /* 마케팅 수신 내용 한 줄 고지 — 정보통신망법(auth-uiux.md 4.3). TODO(카피 미확정) */
    marketingDescription: '새 콘텐츠·이벤트 소식을 알려드려요',
    view: '보기',
    submit: '동의하고 시작하기',
    /* TODO(카피 미확정): 에러 안내 2종 */
    signupExpired: '로그인이 만료됐어요. 다시 로그인해주세요',
    consentStale: '약관이 갱신됐어요. 다시 로그인해 확인해주세요',
  },
} as const;
