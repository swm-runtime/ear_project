import type { AppLanguage } from '@/shared/i18n/locale';
import { localized, type LocalizedCopy } from '@/shared/i18n/localized';

import type {
  ConsentType,
  ContentLanguage,
  SocialProvider,
  WithdrawalReasonCode,
} from './auth.types';

/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 auth-uiux.md와 1:1 대조한다.
 * TODO 표시 항목은 uiux 문서에 확정 카피가 없어 임시로 둔 것 — 확정 시 교체한다.
 */
const ko = {
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
  /**
   * A21 콘텐츠 언어 선택 — 신규 가입자만(auth-uiux.md 4.2-1, 2026-10-15). 고른 값이 시장을 정하므로
   * "무엇이 달라지는지"와 "바꿀 수 없다"를 같은 화면에서 밝힌다(global-api.md 4.1).
   * **이 화면의 문구는 표시 언어가 아니라 지금 고른 선택지의 언어를 따른다**(PM 2026-10-19) — 화면은 `AUTH_COPY` 대신
   * 두 벌을 다 가진 `CONTENT_LANGUAGE_COPY`(파일 아래)를 읽는다.
   */
  contentLanguage: {
    title: '어떤 언어로 들을까요?',
    description: '고른 언어에 따라 받아 보는\n에피소드와 주제가 달라져요',
    /** 선택지 이름은 **그 언어 자신의 표기**다 — 표시 언어를 못 읽는 사람도 자기 언어를 찾을 수 있게 */
    option: {
      ko: '한국어',
      en: 'English',
    } satisfies Record<ContentLanguage, string>,
    /** 선택지 아래 한 줄 — 무엇을 받게 되는지(화면 언어로). "Learn Korea with K-podcast"는 A1 시작 화면 문구다(PM 2026-10-19) */
    optionDescription: {
      ko: '한국어 에피소드와 주제',
      en: '영어 에피소드와 주제',
    } satisfies Record<ContentLanguage, string>,
    /** English 권장 — K-컬처에 관심 있는 영어 사용자에게 하는 말이라 화면 언어와 무관하게 **늘 영어**(PM 2026-10-19) */
    recommendEnglish: 'Into K-culture? Choose English',
    notChangeable: '가입한 뒤에는 바꿀 수 없어요',
    next: '다음',
    backA11y: '뒤로가기',
  },
  consent: {
    /* TODO(카피 미확정): 인사 라인 — 시각 개편(changes/pending/auth-consent-visual-refresh.md) */
    greeting: '만나서 반가워요!',
    /* TODO(카피 미확정): 약관 동의 화면 타이틀 */
    title: '서비스 이용을 위해\n동의가 필요해요',
    agreeAll: '전체 동의',
    label: {
      terms: '이용약관 동의',
      privacy: '개인정보 처리방침 동의',
      marketing: '마케팅 정보 수신 동의',
      // 연령 확인의 표시 문구는 기준 연령이 나라별이라 ageConfirmationLabel(minAge) 이 갖는다. 이 표는 서버 유형과
      // 1:1이어야 해서 자리를 비워둘 수 없다(값은 KR 문구)
      age_confirmation: '만 18세 이상입니다',
      /**
       * 국외 이전 동의 — 서버가 GLOBAL 목록에만 싣는다(KAN-215·216). [보기]는 처리방침의 국외 이전 절.
       * 확정 카피는 auth-uiux.md 4.3 "국외 이전 행"
       */
      cross_border_transfer:
        '개인정보 처리방침에 안내된 대로, 내 정보가 대한민국으로 이전되어 처리되고 미국 등 다른 나라의 서비스 제공자도 처리하는 데 동의합니다',
    } satisfies Record<ConsentType, string>,
    /**
     * 연령 확인 — KR 시장 문구(만 18세). 화면은 이 값을 직접 쓰지 않고 서버가 판정한 기준 연령을 끼우는
     * `ageConfirmationLabel(minAge)` 을 쓴다(나라별 16·18 — KAN-206, global-api.md 2.1)
     */
    ageConfirmation: '만 18세 이상입니다',
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
  /**
   * A20 재동의 — 기존 사용자(auth-uiux.md 4.3-1). A4와 문구를 나눈다:
   * 신규 가입은 "시작"이고 여기는 "계속 이용"이다. TODO(카피 미확정)
   */
  reconsent: {
    title: '약관이 업데이트되었어요',
    description: '계속 이용하시려면 아래 항목에 동의해 주세요',
    submit: '동의하고 계속하기',
    logout: '로그아웃',
    /** 거절은 확인을 받고 처리한다 — 확인 없이 세션을 끊지 않는다 */
    logoutConfirmTitle: '동의해야 계속 이용할 수 있어요',
    logoutConfirmBody: '로그아웃할까요? 계정과 저장한 콘텐츠는 그대로 남아요.',
    logoutCancel: '취소',
    logoutConfirm: '로그아웃',
    submitFailed: '동의를 저장하지 못했어요. 잠시 후 다시 시도해주세요',
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
  /** 회원 탈퇴(auth-uiux.md 4.5~4.6 · wireframe A7·A7-b·A8) */
  withdrawal: {
    /* TODO(카피 미확정): 앱바 타이틀·헤드라인은 와이어프레임 표기를 옮긴 것이다 */
    appBarTitle: '회원 탈퇴',
    backA11y: '뒤로가기',
    headline: '정말 떠나시나요?',

    /* 진입 조회(4.6) 실패의 전체 화면 에러. TODO(카피 미확정) */
    loadFailed: '탈퇴 안내를 불러올 수 없어요',
    retry: '다시 시도',

    /* 즉시 파기 목록 — 서버가 내려주는 값이 아니라 화면 고지다(auth.md 4.3-4 즉시 파기 대상).
       TODO(카피 미확정) */
    deleted: {
      title: '바로 삭제돼요',
      items: [
        '라이브러리에 담은 콘텐츠',
        '관심 주제와 커리어 정보',
        '재생 위치와 청취 기록',
        '알림·재생 설정',
      ],
    },

    /* 보존 섹션 — **결제 이력이 있을 때만 그린다.** 연수는 서버 응답값이다(auth-api.md 4.6).
       TODO(카피 미확정) */
    retained: {
      title: (years: number) => `법령에 따라 ${years}년간 보관돼요`,
      /** 서버가 내려주는 항목 키의 표시 문구. 모르는 키는 키 자체를 노출한다(고지 누락 금지) */
      item: {
        email: '이메일 주소 (거래 확인용)',
        subscription_history: '결제·구독 이력',
        consent_history: '동의 이력',
      } as Record<string, string | undefined>,
      basis: '전자상거래법에 따른 거래기록 보존 의무입니다.',
    },

    /* 결제 이력이 없을 때만 노출. 이 경우 보존 섹션은 그리지 않는다(auth-uiux.md 4.5) */
    immediateDeletionNotice: '모든 데이터가 즉시 삭제됩니다.',

    /* 활성 구독 안내 — **텍스트만.** 스토어로 보내는 버튼·딥링크를 두지 않는다(auth.md 4.3-2).
       TODO(카피 미확정) */
    activeSubscription: {
      title: '구독을 이용 중이에요',
      description:
        '스토어에서 구독을 따로 해지하지 않으면 결제가 계속됩니다. 해지는 설정 > 요금제 관리에서 할 수 있어요.',
      /** 이 체크 없이는 [탈퇴하기]가 활성되지 않는다(auth.md 4.3-2) */
      agreement: '구독 혜택이 즉시 종료되는 것에 동의합니다',
    },

    /* 사유는 필수 입력이다(KAN-205 — [기타]의 자유 입력만 선택). **선택지 문구·reason_code 값 목록은 문서상 미확정이라**
       서버 enum(WithdrawalReason) 주석의 문구를 옮겨 둔 것이다 — TODO(카피 미확정) */
    reason: {
      label: '탈퇴 이유를 알려주세요',
      option: {
        content_quailty: '콘텐츠 품질이 기대에 못 미쳤어요',
        recommendation_mismatch: '제 관심사와 맞지 않는 콘텐츠가 왔어요',
        low_usage: '들을 시간이 없거나 잘 안 쓰게 됐어요',
        price: '구독 가격이 부담됐어요',
        not_enough_content: '듣고 싶은 주제 콘텐츠가 부족했어요',
        app_issue: '앱 오류나 사용이 불편했어요',
        alternative: '다른 서비스를 이용하게 됐어요',
        other: '기타 (직접 입력)',
      } satisfies Record<WithdrawalReasonCode, string>,
      textLabel: '남기고 싶은 말',
      textPlaceholder: '자유롭게 적어주세요',
    },

    /* TODO(카피 미확정): 최종 확인 체크 */
    confirm: '안내 내용을 모두 확인했습니다',

    submit: '탈퇴하기',
    /** 파괴적 액션 옆의 취소 경로 — 같은 화면에 남긴다(auth-uiux.md 4.5) */
    cancel: '취소',

    /* A8 처리 중 — 전체 화면, 취소 불가(auth-uiux.md 4.6). TODO(카피 미확정) */
    processing: {
      title: '탈퇴를 처리하고 있어요',
      description: '잠시만 기다려주세요',
    },

    /** auth-uiux.md 4.6 — 확정 카피. 완료 후 시작 화면으로 스택을 초기화한다 */
    successToast: '탈퇴가 완료되었습니다',

    /* 실패 안내 — 서버 message를 우선 쓰고 없을 때의 기본값이다(common-error-handling.md 4.6) */
    failed: '탈퇴하지 못했어요. 다시 시도해주세요',
    /** WITHDRAWAL_ARCHIVE_IDENTITY_MISSING — 탈퇴가 **진행되지 않았음**을 반드시 알린다 */
    archiveIdentityMissing: {
      title: '문제가 발생했어요',
      description: '탈퇴는 진행되지 않았어요. 잠시 후 다시 시도하거나 고객센터로 문의해주세요',
      back: '돌아가기',
    },
  },
} as const;

const en: LocalizedCopy<typeof ko> = {
  start: {
    appName: 'Earcast',
    tagline: 'Lend us your ear',
    // 글로벌은 K-콘텐츠 위주(PM 확정 2026-10-19) — 한국어 "매일 출근길에 도착하는 나만의 팟캐스트"의 번역이 아니다
    description: 'Learn Korea with K-podcast',
    termsLink: 'Terms of Use',
    privacyLink: 'Privacy Policy',
    provider: {
      kakao: 'Continue with Kakao',
      naver: 'Continue with Naver',
      google: 'Continue with Google',
      apple: 'Continue with Apple',
    },
    providerSectionLabel: 'Continue with a social account',
  },
  loginFailed: 'Couldn’t sign in. Please try again',
  contentLanguage: {
    title: 'Which language do you want to listen in?',
    description: 'The language you choose decides which episodes and topics you get.',
    option: {
      ko: '한국어',
      en: 'English',
    },
    optionDescription: {
      ko: 'Episodes and topics in Korean',
      en: 'Episodes and topics in English',
    },
    recommendEnglish: 'Into K-culture? Choose English',
    notChangeable: 'You can’t change this after signing up.',
    next: 'Continue',
    backA11y: 'Back',
  },
  consent: {
    greeting: 'Nice to meet you!',
    title: 'Please agree to the following\nto use the service',
    agreeAll: 'Agree to all',
    label: {
      terms: 'Agree to Terms of Use',
      privacy: 'Agree to Privacy Policy',
      marketing: 'Receive marketing updates',
      age_confirmation: 'I’m 18 or older',
      cross_border_transfer:
        'I agree that my information is transferred to and processed in the Republic of Korea, and by service providers in other countries such as the United States, as described in the Privacy Policy.',
    },
    ageConfirmation: 'I’m 18 or older',
    requiredTag: '(Required)',
    optionalTag: '(Optional)',
    marketingDescription: 'Get news about new content and events',
    view: 'View',
    submit: 'Agree and start',
    signupExpired: 'Your sign-in has expired. Please sign in again',
    consentStale: 'Our terms have been updated. Please sign in again to review them',
  },
  reconsent: {
    title: 'We’ve updated our terms',
    description: 'To keep using the service, please agree to the items below',
    submit: 'Agree and continue',
    logout: 'Sign out',
    logoutConfirmTitle: 'You need to agree to keep using the service',
    logoutConfirmBody: 'Sign out? Your account and saved content will stay as they are.',
    logoutCancel: 'Cancel',
    logoutConfirm: 'Sign out',
    submitFailed: 'Couldn’t save your consent. Please try again in a moment',
  },
  email: {
    appBarTitle: 'Verify email',
    backA11y: 'Back',
    loadFailed: 'Couldn’t load verification info',
    verifyFailed: 'Couldn’t verify. Please try again',
    currentLabel: 'Current email',
    unregistered: 'Not registered',
    inputLabel: 'Email address',
    inputPlaceholder: 'example@email.com',
    changeNotice: 'Changing your address uses the same verification steps',
    send: 'Get verification code',
    formatInvalid: 'Check your email format',
    alreadyRegistered: 'This email is already registered',
    sendFailedToast: 'Couldn’t send the verification email. Please try again',
    retry: 'Try again',
    codeGuide: (email: string) => `Enter the 6-digit code\nwe sent to ${email}`,
    codeDigitA11y: (index: number) => `Verification code digit ${index}`,
    resend: 'Resend',
    resendCooldown: (sec: number) => `Resend in ${sec}s`,
    reenterEmail: 'Re-enter email',
    spamNotice: 'If you don’t see the email, check your spam folder',
    codeMismatch: (attemptsRemaining: number | null) =>
      attemptsRemaining === null
        ? 'Incorrect verification code'
        : `Incorrect verification code (${attemptsRemaining} ${attemptsRemaining === 1 ? 'attempt' : 'attempts'} left)`,
    codeExpired: 'The code has expired. Please request a new one',
    attemptsExceeded: 'Please request a new code',
    sendLimit: (minutes: number) =>
      `You can send up to 5 codes per hour to this address. Try again in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, or verify with a different email`,
    successToast: 'Your email has been registered',
    countdownA11y: (sec: number) => `${sec} ${sec === 1 ? 'second' : 'seconds'} left`,
  },
  withdrawal: {
    appBarTitle: 'Delete account',
    backA11y: 'Back',
    headline: 'Are you sure you want to leave?',

    loadFailed: 'Couldn’t load account deletion info',
    retry: 'Try again',

    deleted: {
      title: 'Deleted right away',
      items: [
        'Content saved to your library',
        'Your topics of interest and career info',
        'Playback positions and listening history',
        'Notification and playback settings',
      ],
    },

    retained: {
      title: (years: number) =>
        `Kept for ${years} ${years === 1 ? 'year' : 'years'} as required by law`,
      item: {
        email: 'Email address (for transaction verification)',
        subscription_history: 'Payment and subscription history',
        consent_history: 'Consent history',
      },
      basis: 'Transaction records must be kept under Korea’s E-Commerce Act.',
    },

    immediateDeletionNotice: 'All your data will be deleted right away.',

    activeSubscription: {
      title: 'You have an active subscription',
      description:
        'Payments will continue unless you cancel your subscription in the store. You can cancel in Settings > Manage plan.',
      agreement: 'I agree that my subscription benefits will end immediately',
    },

    reason: {
      label: 'Tell us why you’re leaving',
      option: {
        content_quailty: 'The content quality didn’t meet my expectations',
        recommendation_mismatch: 'The content didn’t match my interests',
        low_usage: 'I don’t have time to listen or rarely use it',
        price: 'The subscription is too expensive',
        not_enough_content: 'Not enough content on topics I want',
        app_issue: 'The app had bugs or was hard to use',
        alternative: 'I’m switching to another service',
        other: 'Other (please specify)',
      },
      textLabel: 'Anything else you’d like to share',
      textPlaceholder: 'Write anything you like',
    },

    confirm: 'I’ve read all of the above',

    submit: 'Delete account',
    cancel: 'Cancel',

    processing: {
      title: 'Deleting your account',
      description: 'This will only take a moment',
    },

    successToast: 'Your account has been deleted',

    failed: 'Couldn’t delete your account. Please try again',
    archiveIdentityMissing: {
      title: 'Something went wrong',
      description: 'Your account was not deleted. Please try again in a moment or contact support',
      back: 'Go back',
    },
  },
};

export const AUTH_COPY = localized({ ko, en });

/**
 * A21 콘텐츠 언어 화면의 두 벌 — 화면 문구가 **지금 고른 선택지의 언어**를 따르므로(PM 2026-10-19) 표시 언어로 한 벌만
 * 고른 `AUTH_COPY.contentLanguage` 로는 그릴 수 없다. 앱 전체의 표시 언어는 바꾸지 않는다 — 이 화면만 바뀐다.
 */
export const CONTENT_LANGUAGE_COPY: Readonly<
  Record<ContentLanguage, LocalizedCopy<typeof ko.contentLanguage>>
> = {
  ko: ko.contentLanguage,
  en: en.contentLanguage,
};

/**
 * 연령 확인 문구 — 숫자는 **서버가 판정한 기준 연령**이다(KAN-206 나라별, PM 2026-10-16 — `resolveMinAge`). 문구는 표시
 * 언어를 따르고 숫자만 끼운다. 한국어 18은 종전 `consent.ageConfirmation`("만 18세 이상입니다")과 같은 문자열이다.
 * `AUTH_COPY` 밖에 두는 이유: 한국어 카피 회귀 스냅숏(`copy-ko.snapshot.test.ts`)의 모양을 바꾸지 않기 위해서다.
 */
const AGE_CONFIRMATION = {
  ko: (minAge: number) => `만 ${minAge}세 이상입니다`,
  en: (minAge: number) => `I confirm that I am ${minAge} or older`,
} satisfies Record<AppLanguage, (minAge: number) => string>;

/** 기준 연령의 연령 확인 문구(표시 언어로). `language` 는 테스트용 — 생략하면 지금 표시 언어 */
export const ageConfirmationLabel = (minAge: number, language?: AppLanguage): string =>
  localized<(minAge: number) => string>(AGE_CONFIRMATION, language)(minAge);
