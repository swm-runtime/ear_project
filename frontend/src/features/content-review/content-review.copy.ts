import { formatDateLabelMonthDay } from '@/shared/i18n/format';
import { localized, type LocalizedCopy } from '@/shared/i18n/localized';

/**
 * 사용자 노출 문구(convention.md 3.5) — 확정 카피는 spec/uiux 와 1:1 대조한다
 * (library-uiux.md 4.13 L17 · 4.14 L18 · 4.15 L19 · content-detail-uiux.md 4.6 · settings-uiux.md 4.8 S12 · S13).
 *
 * - **"쿠폰"을 쓰지 않는다** — 코드로 받은 것도 후기로 받은 것도 "프로모션"이다(content-review.md 4.6).
 * - 프로모션 이름(`name` — KR "후기 참여" · GLOBAL "Review") · 요금제 이름 · 일수 · 날짜는 **서버 값**을 끼운다. 티어 이름을 문구에 박지 않는다.
 * - 날짜는 서버가 준 서비스 날짜 라벨(YYYY-MM-DD)을 그대로 "N월 N일"로 읽는다 — 기기 시각 · 05시 보정을 하지 않는다.
 */
const date = (label: string): string => formatDateLabelMonthDay(label, 'ko');
const dateEn = (label: string): string => formatDateLabelMonthDay(label, 'en');

const ko = {
  /** 세 더보기 시트(L4 · E12 · PL7)의 [상세 정보] 아래 행 */
  moreSheetAction: '후기',

  /** 후기 시트(L17) · 먼저 묻는 시트(L18)의 공통 몸체 */
  sheet: {
    title: '후기 남기기',
    /** L18 제목 — 끝까지 들은 편 하나를 묻는다 */
    promptTitle: '다 들은 편, 어떠셨어요?',
    /** L18 제목 줄 오른쪽 위 — 추천 별점 팝업의 [이번 주 그만 보기]와 같은 자리 · 같은 말 */
    muteThisWeek: '이번 주 그만 보기',
    placeholder: '좋았던 점, 아쉬웠던 점을 들려주세요',
    textA11y: '후기 글',
    counter: (length: number, max: number) => `${length}/${max}`,
    counterA11y: (length: number, max: number) => `${max}자 중 ${length}자`,
    /** 보상 줄 — 서버가 진행 값을 줄 때만(받은 적 없고 발급 스위치가 켜져 있을 때). 문턱은 서버 값 */
    rewardLine: (current: number, required: number) =>
      `끝까지 들은 편 ${required}개에 후기를 남기면 프로모션을 드려요 · 지금 ${current}/${required}`,
    send: '보내기',
    /** 이미 쓴 편 — 내 후기가 채워진 채 열린다 */
    update: '수정하기',
    retry: '다시 시도',
    close: '닫기',
    sendFailed: '보내지 못했어요. 다시 시도해주세요',
    ratingGroupA11y: (title: string) => `${title} 별점`,
    starA11y: (stars: number) => `별 ${stars}개`,
  },

  /** 토스트 */
  toast: {
    thanks: '후기 고마워요',
    /** 들어 본 적 없는 편 — 시트 대신 이 안내(content-review.md 5장) */
    notPlayed: '들어 본 편에만 후기를 남길 수 있어요',
    /** 회수 · 만료된 편 · 그 밖에 서버가 막은 편 */
    unavailable: '이 편에는 후기를 남길 수 없어요',
    loadFailed: '후기를 불러오지 못했어요. 잠시 후 다시 시도해주세요',
  },

  /** 발급 안내 시트(L19) — 저장 응답에 이번에 발급된 프로모션이 있을 때 */
  issued: {
    title: (name: string) => `${name} 프로모션을 받았어요`,
    body: (planName: string, grantDays: number, lastUsableDate: string) =>
      `${planName} ${grantDays}일 · ${date(lastUsableDate)}까지 설정 › 프로모션에서 쓸 수 있어요`,
    useNow: '지금 쓰기',
    later: '나중에',
  },

  /** 콘텐츠 상세의 "내 후기" 줄(content-detail-uiux.md 4.6) */
  detail: {
    label: '내 후기',
    edit: '수정',
    write: '후기 남기기',
    starsA11y: (stars: number) => `내 별점 ${stars}개`,
  },

  /** S12 프로모션 화면(settings-uiux.md 4.8) */
  promotions: {
    title: '프로모션',
    backA11y: '뒤로 가기',
    activeSection: '이용 중',
    availableSection: '사용 가능한 프로모션',
    /** 카드 제목 — "후기 참여 프로모션" */
    cardTitle: (name: string) => `${name} 프로모션`,
    cardDetail: (planName: string, grantDays: number, lastUsableDate: string) =>
      `${planName} ${grantDays}일 · ${date(lastUsableDate)}까지 사용`,
    redeem: '사용하기',
    /** 쓸 수 없음 — 서버 사유 그대로 옮긴다. 요금제 이름은 프로모션의 `plan_name` */
    reasonProSubscribed: (planName: string) =>
      `${planName} 구독 중에는 쓸 수 없어요. 구독이 끝난 뒤 쓸 수 있어요`,
    reasonGrantActive: '이용 중인 프로모션이 끝난 뒤 쓸 수 있어요',
    reasonUnknown: '지금은 쓸 수 없어요',
    earnSection: '받을 수 있는 프로모션',
    codeSection: '프로모션 코드',
    loadFailed: '프로모션을 불러오지 못했어요',
    retry: '다시 시도',
    /** 사용 확인 팝업(S13) */
    confirmTitle: (name: string) => `${name} 프로모션을 쓸까요?`,
    confirmBody: (planName: string, grantDays: number, lastDate: string) =>
      `오늘부터 ${planName} ${grantDays}일 · ${date(lastDate)}까지`,
    confirmTrialNote:
      '체험 중엔 재생 한도가 이미 풀려 있어요. 체험이 끝난 뒤 쓰면 더 오래 누릴 수 있어요',
    confirmCancel: '취소',
    confirmOk: '쓰기',
    /** 사용 실패(content-review-api.md 5장) */
    errorExpired: '사용 기한이 지난 프로모션이에요',
    errorNetwork: '네트워크 연결을 확인해주세요',
    errorUnknown: '프로모션을 쓰지 못했어요. 잠시 후 다시 시도해주세요',
  },
};

const en: LocalizedCopy<typeof ko> = {
  moreSheetAction: 'Review',

  sheet: {
    title: 'Write a review',
    promptTitle: 'How was the episode you finished?',
    muteThisWeek: 'Not this week',
    placeholder: 'Tell us what you liked or what could be better',
    textA11y: 'Review text',
    counter: (length: number, max: number) => `${length}/${max}`,
    counterA11y: (length: number, max: number) => `${length} of ${max} characters`,
    rewardLine: (current: number, required: number) =>
      `Review ${required} episodes you finished to get a promotion · ${current}/${required} so far`,
    send: 'Send',
    update: 'Update',
    retry: 'Try again',
    close: 'Close',
    sendFailed: 'Couldn’t send. Please try again.',
    ratingGroupA11y: (title: string) => `Rating for ${title}`,
    starA11y: (stars: number) => (stars === 1 ? '1 star' : `${stars} stars`),
  },

  toast: {
    thanks: 'Thanks for your review',
    notPlayed: 'You can only review episodes you’ve listened to',
    unavailable: 'This episode can’t be reviewed',
    loadFailed: 'Couldn’t load your review. Please try again in a moment',
  },

  issued: {
    title: (name: string) => `You got a ${name} promotion`,
    body: (planName: string, grantDays: number, lastUsableDate: string) =>
      `${planName} for ${grantDays} days · Use it in Settings › Promotions by ${dateEn(lastUsableDate)}`,
    useNow: 'Use now',
    later: 'Later',
  },

  detail: {
    label: 'My review',
    edit: 'Edit',
    write: 'Write a review',
    starsA11y: (stars: number) =>
      stars === 1 ? 'Your rating: 1 star' : `Your rating: ${stars} stars`,
  },

  promotions: {
    title: 'Promotions',
    backA11y: 'Back',
    activeSection: 'In use',
    availableSection: 'Available promotions',
    cardTitle: (name: string) => `${name} promotion`,
    cardDetail: (planName: string, grantDays: number, lastUsableDate: string) =>
      `${planName} · ${grantDays} days · Use by ${dateEn(lastUsableDate)}`,
    redeem: 'Use',
    reasonProSubscribed: (planName: string) =>
      `You can’t use this while subscribed to ${planName}. You can use it after your subscription ends`,
    reasonGrantActive: 'You can use this after your current promotion ends',
    reasonUnknown: 'You can’t use this right now',
    earnSection: 'Review reward',
    codeSection: 'Promo code',
    loadFailed: 'Couldn’t load promotions',
    retry: 'Try again',
    confirmTitle: (name: string) => `Use your ${name} promotion?`,
    confirmBody: (planName: string, grantDays: number, lastDate: string) =>
      `${planName} for ${grantDays} days from today · Until ${dateEn(lastDate)}`,
    confirmTrialNote:
      'Your trial already lifts the play limit. Use this after your trial ends to enjoy it longer',
    confirmCancel: 'Cancel',
    confirmOk: 'Use',
    errorExpired: 'This promotion has expired',
    errorNetwork: 'Check your network connection',
    errorUnknown: 'Couldn’t use the promotion. Please try again in a moment',
  },
};

export const CONTENT_REVIEW_COPY = localized({ ko, en });
