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
  /** 이메일 인증(auth-uiux.md 4.7~4.15) — 설정·프로필 경로(A10). 결제 경로(A9·A19)는 결제 구현 시 */
  email: {
    /* TODO(카피 미확정): 앱바 타이틀 */
    appBarTitle: '이메일 인증',
    backA11y: '뒤로가기',
    /* 진입 조회(4.9) 실패의 전체 화면 에러. TODO(카피 미확정) */
    loadFailed: '인증 정보를 불러올 수 없어요',
    /* 검증 요청의 통신 실패(네트워크 등) 인라인. TODO(카피 미확정) */
    verifyFailed: '인증하지 못했어요. 다시 시도해주세요',
    /* TODO(카피 미확정): 현재 이메일 라벨 */
    currentLabel: '현재 이메일',
    /** 미등록 표기 — 프로필·설정과 같은 문자열을 쓴다(profile-uiux.md 6장) */
    unregistered: '등록되지 않음',
    inputLabel: '이메일 주소',
    /* TODO(카피 미확정): 입력 placeholder */
    inputPlaceholder: 'example@email.com',
    /* 변경도 신규 등록과 같은 절차임을 밝힌다(auth-uiux.md 4.7). TODO(카피 미확정) */
    changeNotice: '주소를 바꿔도 같은 인증 절차를 거쳐요',
    /** auth-uiux.md 4.7 표 — 확정 */
    send: '인증 코드 받기',
    /** auth-uiux.md 4.8 — 확정 카피 2종 */
    formatInvalid: '이메일 형식을 확인해주세요',
    alreadyRegistered: '이미 등록된 이메일이에요',
    /** auth-uiux.md 4.9 — 확정. 발송 횟수는 차감되지 않는다 */
    sendFailedToast: '인증 메일을 보내지 못했어요. 다시 시도해주세요',
    retry: '다시 시도',
    /* 코드 화면 안내 — 발송 주소를 함께 보여준다(auth-uiux.md 4.10). TODO(카피 미확정) */
    codeGuide: (email: string) => `${email}로 보낸\n인증 코드 6자리를 입력해주세요`,
    codeDigitA11y: (index: number) => `인증 코드 ${index}번째 자리`,
    /** auth-uiux.md 4.10 — 확정. 쿨다운 중 비활성 라벨 */
    resend: '재전송',
    resendCooldown: (sec: number) => `${sec}초 후 재전송`,
    reenterEmail: '메일 다시 입력',
    /* 스팸함 안내 — 노출 시점 미결(auth-uiux.md 9장: 항상 vs 재전송 후). 항상 노출로 두고
       확정 시 조정한다. TODO(카피 미확정) */
    spamNotice: '메일이 보이지 않으면 스팸함을 확인해주세요',
    /** auth-uiux.md 4.11 — 확정. 남은 시도는 서버 응답값이다(클라이언트가 세지 않는다) */
    codeMismatch: (attemptsRemaining: number | null) =>
      attemptsRemaining === null
        ? '인증 코드가 올바르지 않아요'
        : `인증 코드가 올바르지 않아요 (남은 시도 ${attemptsRemaining}회)`,
    /** auth-uiux.md 4.12 — 확정 */
    codeExpired: '인증 시간이 지났어요. 코드를 다시 받아주세요',
    /** auth-uiux.md 4.13 — 확정. A15(만료)와 다른 문구다 */
    attemptsExceeded: '코드를 다시 받아주세요',
    /**
     * auth-uiux.md 4.14 — 확정. 잠금은 계정이 아니라 그 주소에만 걸린다 —
     * 계정 전체 제한처럼 읽히는 문구 금지(8장). 남은 시간은 분 단위 필수.
     */
    sendLimit: (minutes: number) =>
      `이 주소로는 1시간에 5번까지 보낼 수 있어요. 약 ${minutes}분 후 다시 시도하거나, 다른 메일로 인증해주세요`,
    /** auth-uiux.md 4.15 — 확정. 설정·프로필 경로 복귀 토스트 */
    successToast: '이메일이 등록되었어요',
    countdownA11y: (sec: number) => `남은 시간 ${sec}초`,
  },
} as const;
