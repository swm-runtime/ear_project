import { formatEnCount } from '@/shared/i18n/format';
import { localized, type LocalizedCopy } from '@/shared/i18n/localized';

/**
 * 사용자 노출 문구(convention.md 3.5) — interest-management-uiux.md 6장 확정 카피 전수와 1:1 대조.
 * 헤드라인·상한 토스트·0개 사유는 온보딩과 문자열까지 동일해야 한다(uiux 6장 — 변형 금지).
 */
const ko = {
  appBarTitle: '관심 주제 관리',
  backA11y: '뒤로가기',
  headline: '어떤 이야기가 궁금하세요?',
  /** "N/3 선택" — 분모는 서버가 내려준 maxSelectable이다 */
  countLabel: (count: number, max: number) => `${count}/${max} 선택`,
  /** "이 슬래시 삼"으로 읽히지 않게 낭독 라벨을 따로 둔다(uiux 7장) */
  countA11y: (count: number, max: number) => `${max}개 중 ${count}개 선택`,
  /**
   * 자동 확장으로 들어온 주제 — 버블에 빗금(애플식 "창문 블라인드") 오버레이로 구분하고,
   * 낭독기에는 이 꼬리말을 이름 뒤에 붙인다(KAN-181 — "N/3" 집계에서는 뺀다, interest-management-api.md 4.2).
   */
  autoBadgeA11y: '자동 추가됨',
  changeBadge: (n: number) => `변경 사항 ${n}개`,
  /**
   * 상한 초과 사유 문구 — 탭을 막지 않고 저장만 막는다(변경 2026-08-11: 0개 사유와 같은
   * 패턴으로 [저장] 위에 상시 노출). 문자열은 온보딩 상한 토스트와 동일하다.
   */
  limitNotice: (max: number) => `관심 주제는 ${max}개까지 선택할 수 있어요`,
  minRequired: '관심 주제를 1개 이상 선택해주세요',
  /** IM6 — N은 상한(max)을 초과한 개수다(5개 보유·상한 3 → "2개를 해제하면"). 상한은 서버 max_selectable */
  overLimitBanner: (n: number, max: number) =>
    `관심 주제는 ${max}개까지예요. ${n}개를 해제하면 다시 추가할 수 있어요`,
  /** IM4 — 별도 제목 없이 본문만 두는 한 문단 팝업. 주제명을 나열하지 않는다(확정 2026-08-10) */
  removalConfirm: {
    message:
      '선택이 해제된 주제의 새 콘텐츠가 더 이상 라이브러리에 도착하지 않아요. 이미 받은 콘텐츠는 그대로 남아 있어요.',
    cancel: '취소',
    confirm: '변경하기',
  },
  /** IM7 — [저장] 버튼을 두지 않는다(팝업 위에 확인 팝업이 쌓인다 — 확정 2026-08-10) */
  leaveConfirm: {
    title: '변경 사항을 저장하지 않고 나갈까요?',
    stay: '계속 편집',
    leave: '나가기',
  },
  save: '저장',
  saveSuccessToast: '관심사가 변경되었어요',
  /** IM8 — 인라인 에러. 편집 상태는 유지된다 */
  saveFailed: '저장하지 못했어요. 다시 시도해주세요',
  /** IM9 — 조회 실패 */
  loadFailed: '주제 목록을 불러올 수 없어요',
  /*
   * IM9 변형 — 응답은 정상(200)인데 노출 주제가 0건인 상태. 조회 실패 카피를 재사용하지
   * 않는다: 불러오기는 성공했으므로 "불러올 수 없어요"는 사실과 다르다.
   * **온보딩 1단계와 문자열까지 동일해야 한다** — 같은 엔드포인트의 같은 상태다
   * (헤드라인·상한 문구와 같은 규칙. ONBOARDING_COPY.topic.emptyTitle을 import하면
   * 의존 방향 `onboarding → interest`가 뒤집히므로 문자열을 각자 둔다).
   * TODO(카피 미확정): uiux 반영 요청은 changes/pending/onboarding-empty-topic-list.md
   */
  emptyTitle: '아직 준비 중이에요',
  emptyDescription: '주제를 준비하고 있어요.\n잠시 후 다시 시도해주세요',
  retry: '다시 시도',
  /*
   * 자동 추가 안내 — 관심 주제가 자동으로 추가됐을 때 그 사실을 1회만 알린다(KAN-181 · PM 2026-10-15:
   * 빗금만으로는 사용자가 알아채지 못한다). **내부 용어("자동 확장·편성") 노출 금지**(uiux 7장) — "자동으로 담았다"는
   * 사용자 언어를 쓰고, 화면의 빗금 표시와 "눌러서 빼기"를 연결해 준다. 안내뿐이라 버튼 하나다(HIG Alerts).
   */
  autoNotice: {
    title: '취향에 맞는 주제를 담아뒀어요',
    body: '들으신 내용을 바탕으로 관심 가질 만한 주제를 자동으로 담았어요. 빗금으로 표시돼요 — 원치 않으면 그 주제를 눌러 빼면 돼요.',
    confirm: '알겠어요',
  },
} as const;

const en: LocalizedCopy<typeof ko> = {
  appBarTitle: 'Manage interests',
  backA11y: 'Back',
  headline: 'What are you curious about?',
  countLabel: (count: number, max: number) => `${count}/${max} selected`,
  countA11y: (count: number, max: number) => `${count} of ${max} selected`,
  autoBadgeA11y: 'Added automatically',
  changeBadge: (n: number) => formatEnCount(n, { one: 'change', other: 'changes' }),
  limitNotice: (max: number) =>
    `You can choose up to ${formatEnCount(max, { one: 'topic', other: 'topics' })}`,
  minRequired: 'Select at least 1 topic',
  overLimitBanner: (n: number, max: number) =>
    `You can have up to ${formatEnCount(max, { one: 'topic', other: 'topics' })}. Deselect ${n} to add new ones.`,
  removalConfirm: {
    message:
      "New episodes from deselected topics will no longer arrive in your Library. Episodes you've already received will stay.",
    cancel: 'Cancel',
    confirm: 'Change',
  },
  leaveConfirm: {
    title: 'Leave without saving changes?',
    stay: 'Keep editing',
    leave: 'Leave',
  },
  save: 'Save',
  saveSuccessToast: 'Interests updated',
  saveFailed: "Couldn't save. Please try again.",
  loadFailed: "Couldn't load topics",
  emptyTitle: 'Coming soon',
  emptyDescription: "We're getting topics ready.\nPlease try again later.",
  retry: 'Try again',
  autoNotice: {
    title: 'We added a topic for you',
    body: "Based on what you've been listening to, we added a topic you might like. It's marked with diagonal stripes — tap it to remove it if you'd rather not.",
    confirm: 'Got it',
  },
};

export const INTEREST_COPY = localized({ ko, en });
