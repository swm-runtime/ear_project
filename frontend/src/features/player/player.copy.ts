/**
 * 사용자 노출 문구(convention.md 3.5). 재생 게이트·잔여 표시의 카피는 진입점(라이브러리·탐색)이
 * 공유하므로 player가 소유한다 — 확정 카피는 library-uiux.md 4.3·4.6과 1:1 대조한다.
 */
export const PLAYER_COPY = {
  /** 잔여 재생 표시(library-uiux.md 4.3) — paywall.md 5장과 같은 한 문자열만 쓴다 */
  remaining: {
    label: (remaining: number, limit: number) => `오늘 재생 ${remaining}/${limit} 남음`,
    /** "1/2"가 "일 슬래시 이"로 읽히지 않게 한다(library-uiux.md 7) */
    a11yLabel: (remaining: number, limit: number) => `오늘 재생 ${limit}회 중 ${remaining}회 남음`,
    a11yLabelExhausted: '오늘 재생 0회 남음, 구독 안내 열기',
  },

  /** L3 재생 확인 팝업(library-uiux.md 4.6) — 탐색 E4도 같은 팝업이다(explore-uiux.md 4.5) */
  playConfirm: {
    title: (remaining: number) => `오늘 ${remaining}회 남았어요`,
    body: '재생하면 1회가 차감돼요.',
    cancel: '취소',
    play: '재생하기',
    /* TODO(카피 재검토 — uiux 9장): 라벨이 "재생 없이 닫기"로 읽힌다. 후보 "재생하고 오늘은 그만 묻기" */
    suppressToday: '오늘은 그만 보기',
  },

  /** L13 회수 안내 — 오류 톤·재시도 유도를 붙이지 않는다(library-uiux.md 4.11) */
  withdrawnToast: '제공이 종료된 콘텐츠예요',

  /** 한도 있는 유료 티어의 소진 안내 — 페이월이 아니다(library-api.md 5장) */
  paidLimitReachedToast: '오늘 청취 한도를 모두 사용했어요',

  /* TODO(paywall feature): 페이월 바텀시트(paywall.md 4.5)는 paywall feature가 소유한다.
     구현 전까지 서버 안내 문구와 같은 토스트로 대체한다. */
  paywallPlaceholderToast: '오늘 들을 수 있는 콘텐츠를 모두 들었어요',

  /** 재생 시작 실패의 공통 폴백 — 서버 message가 없을 때만 쓴다 */
  playFailedToast: '잠시 후 다시 시도해주세요',
} as const;
