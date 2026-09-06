import { NOTIFICATION_COPY } from '@/features/notification';

/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 onboarding-uiux.md와 1:1 대조한다.
 * TODO 표시 항목은 uiux 문서에 확정 카피가 없어 임시로 둔 것 — 확정 시 교체한다.
 */
export const ONBOARDING_COPY = {
  /** O1–O3 관심 주제 선택(onboarding-uiux.md 4.1) */
  topic: {
    /* TODO(카피 미확정): 상단 툴바 타이틀 — uiux 반영 요청은 changes/pending/onboarding-o1-visual-refresh.md */
    toolbarTitle: '관심 주제',
    /** 큰 헤드라인 한 문장으로 안내까지 합쳤다 — 별도 개수 안내 줄이 없다(시각 개편) */
    title: '궁금한 이야기를\n최대 3개까지 골라주세요',
    /** 선택 후에는 "N/3 선택" 형식 — countLabel로 만든다 */
    countLabel: (count: number, max: number) => `${count}/${max} 선택`,
    limitToast: '관심 주제는 3개까지 선택할 수 있어요',
    next: '다음',
    /** O6 목록 조회 실패(onboarding-uiux.md 4.2) */
    loadFailedTitle: '주제를 불러오지 못했어요',
    loadFailedDescription: '잠시 후 다시 시도해주세요',
    retry: '다시 시도',
  },
  /** O4 커리어 정보(onboarding-uiux.md 4.3) */
  career: {
    /* TODO(카피 미확정): 상단 툴바 타이틀 — O1과 같은 컨셉(changes/pending/onboarding-o1-visual-refresh.md) */
    toolbarTitle: '커리어',
    /* TODO(카피 미확정): 커리어 화면 타이틀 */
    title: '하시는 일을 알려주세요',
    laterNotice: '나중에 프로필에서 언제든 입력할 수 있어요',
    jobCategoryLabel: '직군',
    jobTitleLabel: '직무',
    jobTitlePlaceholder: '예: 백엔드 엔지니어',
    yearsLabel: '연차',
    /* 연차 구간 표시 라벨 — 확정(2026-08-12): 커리어 정보 화면과 같은 표기다(career.md 3장 — 같은 값 체계·같은 표기) */
    yearsOption: {
      '0-1': '1년 이하',
      '2-3': '2–3년',
      '4-6': '4–6년',
      '7+': '7년 이상',
    },
    skip: '건너뛰기',
    next: '다음',
    /* TODO(카피 미확정): 직군 목록 조회 실패 — 전부 선택 입력이라 진행은 막지 않는다(칩 영역만 에러) */
    jobCategoryLoadFailed: '직군 목록을 불러오지 못했어요',
    retry: '다시 시도',
  },
  /** O7·O8 추천 콘텐츠 담기(onboarding-uiux.md 4.4). 섹션 제목은 서버가 내려준다 */
  pick: {
    /* TODO(카피 미확정): 상단 툴바 타이틀 — O1·O4와 같은 컨셉 */
    toolbarTitle: '콘텐츠 담기',
    title: '먼저 들어볼 콘텐츠를 골라보세요',
    subtitle: '지금 고르지 않아도 괜찮아요',
    submit: (count: number) => `${count}개 담기`,
    skip: '건너뛰기',
    /** 건별 실패 토스트 — CONTENT_WITHDRAWN(onboarding-api.md 5장) */
    withdrawnToast: '제공이 종료된 콘텐츠예요',
    /* TODO(카피 미확정): 담기 부분 실패 안내 */
    partialFailToast: (count: number) => `${count}건은 담지 못했어요`,
  },
  /** O13 완료 대기(onboarding-uiux.md 4.5) — 로딩 문구는 이 한 줄뿐이다 */
  firstDripWaiting: {
    message: '첫 콘텐츠를 준비하고 있어요',
    /* 완료 요청이 재시도 소진으로 실패한 경우의 전체 화면 에러(onboarding-api.md 5장 INTERNAL_ERROR).
       TODO(카피 미확정) */
    completeFailedTitle: '잠시 문제가 생겼어요',
    completeFailedDescription: '잠시 후 다시 시도해주세요',
  },
  /** O9 완료(onboarding-uiux.md 4.6) */
  complete: {
    /* TODO(카피 미확정): 완료 요청 실패(자동 통과 개편으로 이 화면의 유일한 UI) */
    failTitle: '마무리하지 못했어요',
  },
  /**
   * O10 알림 사전 안내 — 문구 소유는 notification.md 5장이라 그쪽 카피를 그대로 쓴다
   * (헤드라인 "새 콘텐츠가 도착하면 알려드릴까요?" — "드립"은 카피에 쓰지 않는다, 합의 2026-08-06.
   * onboarding-uiux.md 4.7의 옛 표기는 changes/pending에 개정 기록).
   */
  notification: NOTIFICATION_COPY.prePrompt,
} as const;
