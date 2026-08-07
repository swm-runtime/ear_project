/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 explore-uiux.md 6장과 1:1 대조한다.
 * 잔여 표시·재생 확인 팝업·회수/한도 토스트는 player가 소유한다(PLAYER_COPY) — 여기 두지 않는다.
 */
export const EXPLORE_COPY = {
  /** 검색창(MVP 비활성 — explore.md 4.5). 비활성임이 스크린리더에도 드러나야 한다(uiux 7) */
  search: {
    placeholder: '콘텐츠 검색',
    disabledA11y: '콘텐츠 검색, 사용할 수 없음',
  },

  /** E12 더보기 액션시트 — MVP에는 담기/제거뿐이다(공유·상세 없음, explore.md 4.6) */
  sheet: {
    save: '라이브러리에 담기',
    remove: '라이브러리에서 제거',
    close: '닫기',
  },

  /** E3 담기 완료 — 제거는 무음이다(uiux 4.4) */
  saveToast: '라이브러리에 담았어요',
  saveToastAction: '보러가기',
  /** 낙관 반영 실패 — 원상 복구 + 토스트(common-error-handling.md 4.4) */
  saveFailedToast: '담지 못했어요. 다시 시도해주세요',
  removeFailedToast: '제거하지 못했어요. 다시 시도해주세요',

  /** 빈 상태 2종 — 원인이 다르므로 문구를 공유하지 않는다(uiux 4.7) */
  empty: {
    feed: {
      title: '준비된 콘텐츠가 곧 늘어나요',
      action: '라이브러리로 가기',
    },
    filtered: {
      title: '이 주제의 콘텐츠는 아직 없어요',
      action: '필터 해제',
    },
  },

  /** E10 전체 화면 에러 — 캐시 피드로 대체하지 않는다(합의 2026-08-06) */
  error: {
    networkTitle: '인터넷 연결을 확인해주세요',
    loadFailedTitle: '일시적인 오류가 발생했어요',
    loadFailedDescription: '잠시 후 다시 시도해주세요',
    retry: '다시 시도',
    loadMoreFailed: '목록을 더 불러오지 못했어요',
  },

  row: {
    durationLabel: (minutes: number) => `${minutes}분`,
    moreA11y: '더보기, 담기·제거',
    /** 완청 체크는 색이 아니라 형태 단서 + 스크린리더 텍스트로 전달한다(library 카드와 동일) */
    completedA11y: '완청한 콘텐츠',
    /** 행은 하나의 탭 영역으로 읽힌다 — 값과 동작을 한 문장으로(uiux 7) */
    a11yLabel: (parts: {
      title: string;
      sourceName: string;
      minutes: number;
      completed: boolean;
    }) =>
      [
        parts.title,
        parts.sourceName,
        `${parts.minutes}분`,
        ...(parts.completed ? ['완청한 콘텐츠'] : []),
        '재생',
      ].join(', '),
  },

  chips: {
    /** 주제 칩은 다중 선택 토글이다(uiux 7) */
    a11yHint: '주제 필터',
  },
} as const;
