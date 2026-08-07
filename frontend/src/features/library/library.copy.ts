/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 library-uiux.md와 1:1 대조한다.
 * TODO 표시 항목은 uiux 문서에 확정 카피가 없거나 미결로 남은 것 — 확정 시 교체한다.
 */
import type { LibrarySourceFilter } from './library.types';

export const LIBRARY_COPY = {
  title: '라이브러리',

  /**
   * 상단 탭 — 상태 3개(FE 개편 2026-08-07: 카드 정보량 축소로 출처는 필터 팝업으로 이동).
   * drip 라벨은 필터 팝업의 출처 섹션에서 쓴다.
   */
  tab: {
    all: '전체',
    unplayed: '미청취',
    completed: '완료',
    drip: '이어 PICK',
  },

  /** 필터 팝업의 출처 섹션 — 카드의 출처 배지를 대체한다(FE 개편 2026-08-07) */
  sourceFilter: {
    sectionTitle: '출처',
    drip: '이어 PICK',
    save: '내가 담은 콘텐츠',
  } satisfies { sectionTitle: string } & Record<LibrarySourceFilter, string>,

  /** 앱바 잔여 재생 표시(library-uiux.md 4.3) — paywall.md 5장과 같은 한 문자열만 쓴다 */
  remaining: {
    label: (remaining: number, limit: number) => `오늘 재생 ${remaining}/${limit} 남음`,
    /** "1/2"가 "일 슬래시 이"로 읽히지 않게 한다(library-uiux.md 7) */
    a11yLabel: (remaining: number, limit: number) => `오늘 재생 ${limit}회 중 ${remaining}회 남음`,
    a11yLabelExhausted: '오늘 재생 0회 남음, 구독 안내 열기',
  },

  /** L3 재생 확인 팝업(library-uiux.md 4.6) */
  playConfirm: {
    title: (remaining: number) => `오늘 ${remaining}회 남았어요`,
    body: '재생하면 1회가 차감돼요.',
    cancel: '취소',
    play: '재생하기',
    /* TODO(카피 재검토 — uiux 9장): 라벨이 "재생 없이 닫기"로 읽힌다. 후보 "재생하고 오늘은 그만 묻기" */
    suppressToday: '오늘은 그만 보기',
  },

  /** L2 필터 바텀시트(library-uiux.md 4.5) — 출처 섹션 추가(FE 개편 2026-08-07) */
  topicFilter: {
    sheetTitle: '필터',
    title: '주제',
    helper: '라이브러리에 담긴 콘텐츠의 주제만 보여줘요',
    reset: '초기화',
    apply: '적용',
    a11yBadge: (count: number) => `필터, ${count}개 적용됨`,
  },

  /** L4 더보기 액션시트 — 메뉴 항목은 삭제 하나뿐이다(library-uiux.md 4.7) */
  moreSheet: {
    delete: '라이브러리에서 삭제',
    close: '닫기',
  },

  /** L5 삭제 스낵바 — 영구 제외 고지를 넣지 않는다(library.md 4.5) */
  deleteSnackbar: {
    message: '삭제했어요',
    undo: '실행 취소',
    /** 낙관 반영 실패 시 원상 복구 + 토스트(common-error-handling.md 4.4) */
    failedToast: '삭제하지 못했어요. 다시 시도해주세요',
  },

  /** 빈 상태 4종 — 원인이 다르므로 문구를 공유하지 않는다(library-uiux.md 4.8) */
  empty: {
    newUser: {
      title: '곧 첫 콘텐츠가 도착해요',
      description: '그동안 탐색에서 직접 골라보셔도 좋아요',
      action: '탐색 둘러보기',
    },
    filtered: {
      title: '조건에 맞는 콘텐츠가 없어요',
      /** 걸린 조건을 그대로 적는다 — 배지 숫자만으로는 무엇이 걸렸는지 알 수 없다 */
      description: (conditions: string[]) =>
        `${conditions.join(' · ')} 조건을 모두 만족하는 콘텐츠가 없습니다`,
      action: '필터 초기화',
    },
    drip: {
      title: '아직 도착한 이어 PICK이 없어요',
    },
    deletedAll: {
      title: '라이브러리가 비어 있어요',
      description: '탐색에서 담으면 여기로 돌아와요',
      action: '탐색 둘러보기',
    },
  },

  /** 상단 배너 — 한 번에 하나, 우선순위는 오프라인 > 드립 준비 중 > 새 콘텐츠 도착 */
  banner: {
    offline: '오프라인 상태예요',
    newArrivals: (count: number) => `새 콘텐츠 ${count}개 도착`,
    dripPreparing: '콘텐츠를 준비하고 있어요',
    addInterest: '관심 주제 추가하기',
  },

  /** L10 캐시 목록 하단 안내 */
  cachedListNotice: '최근 목록만 표시하고 있어요',

  /** L13 회수 안내 — 오류 톤·재시도 유도를 붙이지 않는다(library-uiux.md 4.11) */
  withdrawnToast: '제공이 종료된 콘텐츠예요',

  /** 한도 있는 유료 티어의 소진 안내 — 페이월이 아니다(library-api.md 5장) */
  paidLimitReachedToast: '오늘 청취 한도를 모두 사용했어요',

  /* TODO(paywall feature): 페이월 바텀시트(paywall.md 4.5)는 paywall feature가 소유한다.
     구현 전까지 서버 안내 문구와 같은 토스트로 대체한다. */
  paywallPlaceholderToast: '오늘 들을 수 있는 콘텐츠를 모두 들었어요',

  /** L14 캐시 없는 조회 실패(common-error-handling.md 4.6) */
  error: {
    networkTitle: '인터넷 연결을 확인해주세요',
    loadFailedTitle: '라이브러리를 불러오지 못했어요',
    loadFailedDescription: '잠시 후 다시 시도해주세요',
    retry: '다시 시도',
    /** L15 추가 로딩 실패 — 전체 화면 에러로 전환하지 않는다 */
    loadMoreFailed: '목록을 더 불러오지 못했어요',
    offlinePlayToast: '인터넷 연결을 확인해주세요',
  },

  card: {
    /** 완청은 썸네일 좌상단 체크로만 표시한다 — 색이 아니라 형태 단서(uiux 7) */
    completedA11y: '완청한 콘텐츠',
    /** in_progress는 진행률 바만 있어 텍스트가 없다 — a11y로 반드시 제공한다(uiux 7) */
    progressA11y: (percent: number) => `${percent}% 들음`,
    durationLabel: (minutes: number) => `${minutes}분`,
    moreA11y: (title: string) => `${title} 더보기`,
  },

  miniPlayer: {
    playA11y: '재생',
    expandA11y: (title: string) => `${title} 플레이어 열기`,
    progressA11y: (totalMin: number, currentMin: number) => `${totalMin}분 중 ${currentMin}분`,
  },
} as const;
