import type { YearsOfExperienceRange } from './career.types';

/**
 * 사용자 노출 문구(convention.md 3.5) — career-uiux.md 6장 확정 카피 전수와 1:1 대조.
 * 용도 안내(온보딩 O4)·유도 문구(프로필 카드)·이탈 팝업(관심사 관리)은 다른 화면과
 * 공유하는 문자열이라 그대로 쓴다(uiux 6장 — 변형 금지).
 */
export const CAREER_COPY = {
  appBarTitle: '커리어 정보',
  backA11y: '뒤로가기',
  reset: '초기화',
  /** "초기화"만 읽히면 무엇이 초기화되는지 알 수 없다(uiux 7장) */
  resetA11yLabel: '입력 초기화',
  resetA11yHint: '직군, 직무, 연차를 모두 비워요',
  /** [초기화] 실행 결과 낭독 — 시각적으론 세 필드가 비지만 스크린리더엔 무음이다(uiux 7장) */
  resetAnnouncement: '모든 입력을 비웠어요',
  /** 입력됨 변형 — 온보딩 O4와 같은 문자열(uiux 4.1) */
  purposeNotice: '추천을 더 정확하게 하는 데만 쓰여요',
  /** 미입력 변형 — 프로필 [커리어 정보] 카드와 같은 문자열(uiux 4.3) */
  emptyNotice: '입력하면 추천이 정확해져요',
  jobCategoryLabel: '직군',
  jobTitleLabel: '직무',
  /** 온보딩 O4와 같은 문자열(uiux 4.3) */
  jobTitlePlaceholder: '예) 서비스 기획자',
  yearsLabel: '연차',
  /**
   * enum(0-1/2-3/4-6/7+)의 화면 표기 — 온보딩 O4와 같은 표기를 쓴다(career.md 3장).
   * 경계 구간은 "이하/이상"으로 풀어 쓰는 온보딩 현행 표기로 확정했다(결정 2026-08-12 —
   * uiux 6장의 "0–1년"/"7년+" 표기는 개정 대상, changes/pending 기록).
   */
  yearsChip: {
    '0-1': '1년 이하',
    '2-3': '2–3년',
    '4-6': '4–6년',
    '7+': '7년 이상',
  } satisfies Record<YearsOfExperienceRange, string>,
  save: '저장',
  retry: '다시 시도',
  /** CR4 — 무엇이 잘못됐는지 + 다음 행동(uiux 6장) */
  saveFailed: '저장하지 못했어요. 다시 시도해주세요',
  /** 확정 2026-08-10 — 관심사 관리의 "관심사가 변경되었어요"와 나란한 형태(career.md 4.2) */
  saveSuccessToast: '커리어 정보가 저장되었어요',
  /** CR5 — 관심사 관리(IM7)와 같은 문구·같은 버튼(uiux 4.6) */
  leaveConfirm: {
    title: '변경 사항을 저장하지 않고 나갈까요?',
    stay: '계속 편집',
    leave: '나가기',
  },
  /** 진입 조회 실패 — 공통 전체 화면 에러의 제목(공통 표현이라 uiux 6장 카피 전수 밖이다) */
  loadFailed: '커리어 정보를 불러올 수 없어요',
} as const;
