/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 explore-uiux.md 6장과 1:1 대조한다.
 * 잔여 표시·재생 확인 팝업·회수/한도 토스트는 player가 소유한다(PLAYER_COPY) — 여기 두지 않는다.
 */
export const EXPLORE_COPY = {
  /** E6·E7 검색(explore.md 4.5 — MVP 포함 격상, 합의 2026-08-23) */
  search: {
    /** TODO(카피): uiux 6장 제안값 — features에 확정 문구가 없다 */
    placeholder: '콘텐츠 검색',
    cancel: '취소',
    /** 2자 미만·특수문자/이모지만 입력 — 검색을 실행하지 않는다(explore.md 7장, 확정 문구) */
    emptyPrompt: '검색어를 입력해주세요',
    /** TODO(카피): 섹션 라벨 확정 전 — wireframe E6 표기를 따른다 */
    recentTitle: '최근 검색어',
    clearAll: '전체 삭제',
    suggestedTitle: '추천 키워드',
    /** 입력한 검색어를 그대로 되비춘다(explore.md 4.5-3, 확정 문구) */
    noResult: (query: string) => `‘${query}’ 검색 결과가 없어요`,
    /** E7 대체 목록의 제목(explore-uiux.md 4.6 — "인기 콘텐츠" 행 목록) */
    popularTitle: '인기 콘텐츠',
    /** 결과 갱신을 polite 채널로 한 번 알린다 — "'커리어' 검색 결과 12개"(uiux 7) */
    resultCountA11y: (query: string, count: number) => `‘${query}’ 검색 결과 ${count}개`,
    /** 최근 검색어는 검색어·삭제가 각각 포커스를 받는다(uiux 7) */
    recentItemA11y: (query: string) => `${query}, 최근 검색어, 탭하면 검색`,
    recentDeleteA11y: (query: string) => `‘${query}’ 검색어 삭제`,
    /** 추천 키워드는 버튼이다 — 탭 결과가 필터가 아니라 검색 실행이다(uiux 7) */
    suggestedChipA11y: (name: string) => `${name}, 추천 키워드, 탭하면 검색`,
  },

  /** E12 더보기 액션시트 — 상세 정보·원문 보기·담기/제거(explore-uiux.md 4.4, 공유는 P1) */
  sheet: {
    detail: '상세 정보',
    sourceLink: '원문 보기',
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

  /** E13 인기 구간 토글 — 라벨은 화면 문구이고 week·month·all은 전송값이다(uiux 6장) */
  popular: {
    periodLabels: { week: '주간', month: '월간', all: '전체' },
    toggleA11y: '인기 콘텐츠 집계 구간',
    /** 전환 실패 — 직전 목록을 유지한 채 섹션 안에서만 알린다(uiux 4.10) */
    switchFailed: '목록을 불러오지 못했어요',
    /** 전환 완료를 스크린리더에 한 번 알린다 — "월간 인기 콘텐츠, 10개"(uiux 7) */
    switchedA11y: (periodLabel: string, count: number) =>
      `${periodLabel} 인기 콘텐츠, ${count}개`,
  },
} as const;
