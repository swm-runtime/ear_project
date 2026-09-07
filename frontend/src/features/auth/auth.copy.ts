import type { ConsentType, SocialProvider, WithdrawalReasonCode } from './auth.types';

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
    /* TODO(카피 미확정): 인사 라인 — 시각 개편(changes/pending/auth-consent-visual-refresh.md) */
    greeting: '만나서 반가워요!',
    /* TODO(카피 미확정): 약관 동의 화면 타이틀 */
    title: '서비스 이용을 위해\n동의가 필요해요',
    agreeAll: '전체 동의',
    label: {
      terms: '이용약관 동의',
      privacy: '개인정보 처리방침 동의',
      marketing: '마케팅 정보 수신 동의',
      // 연령 확인의 표시 문구는 consent.ageConfirmation 이 갖는다. 이 표는 서버 유형과
      // 1:1이어야 해서 자리를 비워둘 수 없다
      age_confirmation: '만 18세 이상입니다',
    } satisfies Record<ConsentType, string>,
    /** 연령 확인 — 만 18세 미만 가입을 막는 자기 선언(Play 대상 연령대 18+ 선언과 같은 기준) */
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
        '스토어에서 구독을 따로 해지하지 않으면 결제가 계속됩니다. 해지는 설정 > 구독 관리에서 할 수 있어요.',
      /** 이 체크 없이는 [탈퇴하기]가 활성되지 않는다(auth.md 4.3-2) */
      agreement: '구독 혜택이 즉시 종료되는 것에 동의합니다',
    },

    /* 사유는 선택 입력이다. **선택지 문구·reason_code 값 목록은 문서상 미확정이라**
       서버 enum(WithdrawalReason) 주석의 문구를 옮겨 둔 것이다 — TODO(카피 미확정) */
    reason: {
      label: '탈퇴 이유를 알려주세요 (선택)',
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
