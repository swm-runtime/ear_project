/**
 * 사용자 노출 문구(convention.md 3.5) — interest-management-uiux.md 6장 확정 카피 전수와 1:1 대조.
 * 헤드라인·상한 토스트·0개 사유는 온보딩과 문자열까지 동일해야 한다(uiux 6장 — 변형 금지).
 */
export const INTEREST_COPY = {
  appBarTitle: '관심 주제 관리',
  backA11y: '뒤로가기',
  headline: '어떤 이야기가 궁금하세요?',
  /** "N/3 선택" — 분모는 서버가 내려준 maxSelectable이다 */
  countLabel: (count: number, max: number) => `${count}/${max} 선택`,
  /** "이 슬래시 삼"으로 읽히지 않게 낭독 라벨을 따로 둔다(uiux 7장) */
  countA11y: (count: number, max: number) => `${max}개 중 ${count}개 선택`,
  changeBadge: (n: number) => `변경 사항 ${n}개`,
  limitToast: '관심 주제는 3개까지 선택할 수 있어요',
  minRequired: '관심 주제를 1개 이상 선택해주세요',
  /** IM6 — N은 3을 초과한 개수다(5개 보유 → "2개를 해제하면") */
  overLimitBanner: (n: number) => `관심 주제는 3개까지예요. ${n}개를 해제하면 다시 추가할 수 있어요`,
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
  retry: '다시 시도',
} as const;
