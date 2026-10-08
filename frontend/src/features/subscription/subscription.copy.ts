/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 spec/uiux/subscription-uiux.md 와 1:1 대조한다.
 * 서버 오류 문구는 subscription-api.md 5장 그대로다. 내부 용어("티어"·"드립"·"영수증"·"유예")를 노출하지 않는다.
 * 가격 문자열은 스토어가 준 현지 표기를 그대로 받는다 — 여기서 통화·금액을 만들지 않는다.
 */
const monthDay = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

/** "로"/"으로" — 한글 마지막 글자에 받침이 있고 ㄹ 받침이 아니면 "으로". 영문·숫자는 "로"(Light·Daily·Pro 모두 "로") */
const toParticle = (word: string): '로' | '으로' => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '로';
  const batchim = code % 28;
  return batchim === 0 || batchim === 8 ? '로' : '으로';
};

export const SUBSCRIPTION_COPY = {
  /** 화면 제목 — 설정의 진입 항목 이름과 같다(KAN-146, settings.copy sections.subscription) */
  title: '요금제 관리',
  /** 제목 밑 안내 — 낮출 수 있는 요금제가 있을 때만(PM 2026-10-08 KAN-158). 낮추기는 지금 기간이 끝난 뒤 적용된다 */
  downgradeNotice: '요금제를 낮추면 지금 요금제 기간이 끝난 뒤 자동으로 바뀌어요',
  backA11y: '뒤로 가기',
  loadingA11y: '요금제를 불러오는 중',

  /**
   * SB1 현재 구독 정보 — 이용 중 카드 안에 들어간다(KAN-146). 프로필·설정 플랜 줄과 같은 사실을 같은 톤으로
   * (settings-uiux.md 4.1). 무료 이용자는 이용 중 카드의 설명(서버 description)이 한도를 말하므로 따로 적지 않는다
   */
  status: {
    loadError: '구독 정보를 불러올 수 없어요',
    renewsAt: (iso: string) => `다음 결제일 ${monthDay(iso)}`,
    /** 해지 예약 — 중립 톤. 사용자가 스스로 내린 결정이지 장애가 아니다 */
    cancelScheduled: (iso: string) => `${monthDay(iso)}까지 이용 가능해요`,
    /**
     * 제목 밑 알림 섹션(KAN-160) — 굵은 첫 줄 + 옅은 둘째 줄. 한 문장으로 두면 "이후"에서 어색하게 끊겼다(PM 2026-10-08).
     * 무료 요금제 이름은 서버 값, 모르면 "무료"
     */
    cancelScheduledNotice: (iso: string, planName: string) =>
      `${monthDay(iso)}까지 ${planName} 요금제를 이용할 수 있어요`,
    cancelScheduledNoticeDetail: (freePlanName: string | null) =>
      `이후 ${freePlanName ?? '무료'} 요금제로 바뀌어요`,
    pendingPlanNoticeDetail: (currentPlanName: string) =>
      `그때까지는 ${currentPlanName} 요금제를 그대로 이용할 수 있어요`,
    /** 무료 요금제로 바꾸기(해지)를 골랐을 때 버튼 밑 안내 — 날짜는 서버의 다음 결제일(그날까지는 지금 요금제다) */
    cancelUntil: (iso: string) => `지금 요금제는 ${monthDay(iso)}까지 이용할 수 있어요`,
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

  /** 스토어로 보내는 목록 아래 버튼 — 해지 API 는 없다(subscription.md 4.5). 해지는 무료 요금제 카드의 [{이름}로 변경] */
  manage: {
    resume: '구독 다시 시작',
    checkPayment: '결제 수단 확인',
  },

  /** SB2 요금제 카드 — 이름·설명은 서버 plans.name/description 그대로다(여기서 티어명을 만들지 않는다) */
  plans: {
    freePrice: '무료',
    perMonth: (displayPrice: string) => `${displayPrice}/월`,
    purchase: '구독하기',
    upgrade: '업그레이드',
    downgrade: '변경',
    current: '이용 중',
    downgradeHint: '다음 결제일부터 적용돼요',
    /** [변경](다운그레이드)을 누르면 결제 시트 전에 묻는다(PM 2026-10-08 KAN-158) — 시스템 알림창 */
    downgradeConfirmTitle: (name: string) => `${name}${toParticle(name)} 변경할까요?`,
    downgradeConfirmMessage:
      '지금 요금제는 다음 결제일까지 그대로 쓸 수 있고, 그 뒤 자동으로 바뀌어요.',
    downgradeConfirmCancel: '취소',
    downgradeConfirmOk: '변경',
    /**
     * 카드 아래 버튼 하나 — 고른 요금제 이름을 붙인다("Daily 구독하기" · "Pro 업그레이드" · "Daily로 변경"). 이름은 서버 값이라
     * 조사는 마지막 글자로 고른다(받침 있으면 "으로", 없거나 ㄹ 받침·영문이면 "로")
     */
    cta: (name: string, action: 'purchase' | 'upgrade' | 'downgrade' | 'cancel') => {
      if (action === 'purchase') return `${name} 구독하기`;
      if (action === 'upgrade') return `${name} 업그레이드`;
      return `${name}${toParticle(name)} 변경`;
    },
    /** 고를 수 있는 카드 묶음 — 스크린리더가 "요금제, 라디오 그룹"으로 읽는다 */
    groupA11y: '요금제',
    /** 카드 요약을 한 문장으로 — 이용 중이면 끝에 "이용 중"(색만으로 구분하지 않는다) */
    cardA11y: (name: string, price: string, description: string, isCurrent: boolean) =>
      [name, price, description, isCurrent ? '이용 중' : '']
        .filter((part) => part !== '')
        .join(', '),
  },

  /** 구매 복원 — 맨 아래 약관 링크 줄의 세 번째 링크(KAN-146. 스토어 심사 3.1.1 — 항상 닿아야 한다) */
  restore: '구매 복원',

  /** 스토어 정책상 필수 표기(subscription.md 5장) — 자동 갱신 조건·갱신 시점·해지 방법·가격·기간·약관 링크 */
  legal: {
    /**
     * 자동 갱신 고지 — App Store 3.1.2(구매 확인 시 청구·자동 갱신·24시간 규칙·해지 방법) · 전자상거래법 자동갱신 고지.
     * 가격·기간은 카드에 있다. PM 확정 2026-10-06(KAN-146) — 결제 주체 표기는 "App Store 결제"·"Google Play 결제".
     * 한 줄씩 "·" 글머리 항목으로 그린다(SubscriptionLegalNotice)
     */
    ios: [
      '결제는 구매 확인 시 App Store 결제로 청구되며, 매월 자동 갱신돼요.',
      '기간 종료 24시간 전까지 해지하지 않으면 종료 전 24시간 안에 같은 금액이 다시 청구돼요.',
      '해지는 기기의 설정 › Apple 계정 › 구독에서 할 수 있어요.',
    ],
    android: [
      '결제는 구매 확인 시 Google Play 결제로 청구되며, 매월 자동 갱신돼요.',
      '다음 결제일 전까지 해지하지 않으면 같은 금액이 다시 청구돼요.',
      '해지는 Google Play 스토어 › 결제 및 정기 결제에서 할 수 있어요.',
    ],
    heading: '구독 유의사항',
    bullet: '•',
    terms: '이용약관',
    privacy: '개인정보처리방침',
    /** 링크 사이 구분점·안내 항목의 글머리 — 장식이라 낭독하지 않는다 */
    separator: '·',
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
    /** 다운그레이드 예약 성공 — 서버에 예약 날짜가 아직 없을 때(RTDN 대기) 날짜 없이 */
    downgradeScheduled: '다음 결제일부터 바꾼 요금제가 적용돼요',
    /** 이미 다음 결제일 변경이 예약돼 있다(Play "existing deferred replacement") — 실패가 아니라 안내 */
    downgradeAlreadyScheduled: '이미 다음 결제일부터 요금제가 바뀌도록 예약돼 있어요',
  },

  /** 실패 — subscription-api.md 5장 문구 */
  error: {
    catalog: '요금제를 불러올 수 없어요',
    retry: '다시 시도',
    planUnavailable: '지금은 이 요금제를 구독할 수 없어요',
    storeMismatch: '다른 스토어에서 구독 중이에요. 구독한 기기에서 변경해주세요',
    receiptInvalid: '구독을 확인할 수 없어요. 문의하기로 알려 주시면 확인해 드릴게요',
    ownedByAnotherAccount: '이미 다른 계정에서 사용 중인 구독이에요',
    /** Play 두 번째 구독 409(subscription-api.md 5장 표 문구 그대로) */
    alreadySubscribed: '이미 구독 중이에요. 요금제는 변경으로 바꿔주세요',
    /** Android 요금제 변경 — 바꿀 지금 구독이 이 기기의 Google 계정에 없다(교체 없이 결제하면 두 번째 구독이 된다) */
    /** 스토어가 요금제 변경을 거절했다(Play DEVELOPER_ERROR, KAN-158) */
    changeRejected: '지금은 요금제를 바꿀 수 없어요. 잠시 후 다시 시도해주세요',
    /** Android 다운그레이드 예약은 교체 모듈이 든 빌드에서만 된다(KAN-158) */
    downgradeNeedsUpdate: '요금제를 낮추려면 앱을 최신 버전으로 업데이트해주세요',
    replaceSourceMissing:
      '지금 구독을 이 기기에서 찾을 수 없어요. 구독한 Google 계정으로 다시 시도해주세요',
    storeUnavailable: '지금은 결제를 진행할 수 없어요. 잠시 후 다시 시도해주세요',
    network: '네트워크 연결을 확인해주세요',
    unknown: '결제를 완료하지 못했어요. 잠시 후 다시 시도해주세요',
  },
} as const;
