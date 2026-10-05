/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 spec/uiux/subscription-uiux.md 와 1:1 대조한다.
 * 서버 오류 문구는 subscription-api.md 5장 그대로다. 내부 용어("티어"·"드립"·"영수증"·"유예")를 노출하지 않는다.
 * 가격 문자열은 스토어가 준 현지 표기를 그대로 받는다 — 여기서 통화·금액을 만들지 않는다.
 */
const monthDay = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

export const SUBSCRIPTION_COPY = {
  title: '구독 관리',
  backA11y: '뒤로 가기',
  loadingA11y: '요금제를 불러오는 중',

  /** SB1 현재 구독 카드 — 프로필·설정 플랜 줄과 같은 사실을 같은 톤으로(settings-uiux.md 4.1) */
  status: {
    sectionTitle: '현재 구독',
    loadError: '구독 정보를 불러올 수 없어요',
    free: '무료 이용 중',
    /** N은 서버 daily_play_limit — 하드코딩하지 않는다(paywall.md 5장) */
    freeLimit: (dailyPlayLimit: number | null) =>
      dailyPlayLimit === null
        ? '제한 없이 들을 수 있어요'
        : `하루 ${dailyPlayLimit}편까지 들을 수 있어요`,
    renewsAt: (iso: string) => `다음 결제일 ${monthDay(iso)}`,
    /** 해지 예약 — 중립 톤. 사용자가 스스로 내린 결정이지 장애가 아니다 */
    cancelScheduled: (iso: string) => `${monthDay(iso)}까지 이용 가능해요`,
    /** 결제 문제(유예) — 경고색을 쓰는 유일한 상태 */
    paymentIssueTitle: '결제에 문제가 있어요',
    paymentIssueBody: '결제 수단을 확인하지 않으면 구독이 종료될 수 있어요',
    /** 다운그레이드 예약 — 날짜는 서버의 pending_plan.effective_at */
    pendingPlan: (iso: string, planName: string) =>
      `${monthDay(iso)}부터 ${planName} 요금제가 적용돼요`,
    /** 다른 스토어에서 결제한 구독자 — 이 기기에서는 변경할 수 없다(subscription.md 4.4) */
    otherStore: (store: 'app_store' | 'play_store') =>
      store === 'play_store'
        ? 'Google Play에서 구독 중이에요. 구독한 기기에서 변경해주세요'
        : 'App Store에서 구독 중이에요. 구독한 기기에서 변경해주세요',
  },

  /** 스토어로 보내는 버튼 — 해지 API 는 없다(subscription.md 4.5) */
  manage: {
    cancel: '구독 해지',
    resume: '구독 다시 시작',
    checkPayment: '결제 수단 확인',
  },

  /** SB2 요금제 카드 */
  plans: {
    sectionTitle: '요금제',
    freePrice: '무료',
    perMonth: (displayPrice: string) => `${displayPrice}/월`,
    playLimit: (dailyPlayLimit: number | null) =>
      dailyPlayLimit === null ? '무제한 듣기' : `하루 ${dailyPlayLimit}편 듣기`,
    /** 하루 정규 편성 편수 — 사용자에게는 "이어 PICK"이다(settings.copy 의 알림 이름과 같은 말) */
    dripCount: (count: number) => `이어 PICK 하루 ${count}편`,
    ads: (adsEnabled: boolean) => (adsEnabled ? '광고 포함' : '광고 없음'),
    purchase: '구독하기',
    upgrade: '업그레이드',
    downgrade: '변경',
    current: '이용 중',
    downgradeHint: '다음 결제일부터 적용돼요',
    cardA11y: (name: string, price: string, features: string) => `${name}, ${price}, ${features}`,
  },

  restore: '구매 복원',

  /** 스토어 정책상 필수 표기(subscription.md 5장) — 자동 갱신 조건·갱신 시점·해지 방법·가격·기간·약관 링크 */
  legal: {
    ios: [
      '구독은 1개월 단위이며, 결제는 구매 확인 시 Apple 계정으로 청구돼요.',
      '현재 기간이 끝나기 최소 24시간 전에 해지하지 않으면 같은 가격·기간으로 자동 갱신되고, 갱신 요금은 기간 종료 전 24시간 이내에 청구돼요.',
      '해지는 [구독 해지] 또는 기기의 설정 > Apple 계정 > 구독에서 할 수 있어요. 해지해도 남은 기간이 끝날 때까지 이용할 수 있어요.',
    ],
    android: [
      '구독은 1개월 단위이며, 결제는 구매 확인 시 Google Play 계정으로 청구돼요.',
      '해지하지 않으면 같은 가격·기간으로 매달 자동 갱신돼요.',
      '해지는 [구독 해지] 또는 Google Play 스토어 > 결제 및 정기 결제에서 할 수 있어요. 해지해도 남은 기간이 끝날 때까지 이용할 수 있어요.',
    ],
    terms: '이용약관',
    privacy: '개인정보처리방침',
  },

  /** 진행 상태 */
  progress: {
    purchasingA11y: '결제를 진행하고 있어요',
    verifying: '구독을 확인하고 있어요',
    restoringA11y: '구매를 복원하고 있어요',
  },

  /** 결과 — 토스트·인라인 안내 */
  result: {
    purchased: '구독이 시작되었어요',
    upgraded: '요금제가 변경되었어요',
    restored: '구독이 복원되었어요',
    nothingToRestore: '복원할 구독이 없어요',
    /** 화면 밖(앱 재실행·재시도)에서 반영이 끝났을 때 */
    recovered: '구독이 반영되었어요',
    delayed: '구독을 확인하고 있어요… 잠시 후 자동으로 반영됩니다',
    pending: '결제 승인을 기다리고 있어요. 승인되면 자동으로 반영돼요',
    alreadyOwned: '이미 구독 중이에요. [구매 복원]을 눌러 이 계정에 연결해주세요',
    emailRequired: '구독하려면 이메일 인증이 필요해요',
  },

  /** 실패 — subscription-api.md 5장 문구 */
  error: {
    catalog: '요금제를 불러올 수 없어요',
    retry: '다시 시도',
    planUnavailable: '지금은 이 요금제를 구독할 수 없어요',
    storeMismatch: '다른 스토어에서 구독 중이에요. 구독한 기기에서 변경해주세요',
    receiptInvalid: '구독을 확인할 수 없어요. 문의하기로 알려 주시면 확인해 드릴게요',
    ownedByAnotherAccount: '이미 다른 계정에서 사용 중인 구독이에요',
    storeUnavailable: '지금은 결제를 진행할 수 없어요. 잠시 후 다시 시도해주세요',
    network: '네트워크 연결을 확인해주세요',
    unknown: '결제를 완료하지 못했어요. 잠시 후 다시 시도해주세요',
  },
} as const;
