/**
 * 사용자 노출 문구(convention.md 3.5). 재생 게이트·잔여 표시의 카피는 진입점(라이브러리·탐색)이
 * 공유하므로 player가 소유한다 — 확정 카피는 library-uiux.md 4.3·4.6, 플레이어 화면 카피는
 * player-uiux.md 6장과 1:1 대조한다.
 */
export const PLAYER_COPY = {
  /** 잔여 재생 표시(library-uiux.md 4.3) — paywall.md 5장과 같은 한 문자열만 쓴다 */
  remaining: {
    /** 앞의 재생 아이콘이 "무엇의 횟수인지"를 말하므로 글자는 숫자만 남긴다(2026-09-02) */
    label: (remaining: number, limit: number) => `${remaining}/${limit}`,
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

  /* ── 플레이어 화면(player-uiux.md 6장 — 사용자 노출 문자열 전수) ── */
  screen: {
    /** PL1 — source_url이 있을 때만 노출한다. 없으면 자리도 남기지 않는다(uiux 4.1) */
    sourceLink: '원문 보기',
    /** 배속 칩 상시 표시 "N.N×" — a11y는 "재생 속도, N.N배"로 읽힌다(uiux 7장) */
    rateChip: (rate: number) => `${rate.toFixed(1)}×`,
    rateChipA11y: (rate: number) => `재생 속도, ${rate.toFixed(1)}배`,
    /**
     * P1 보조 칩(uiux 6장 카피) — 기능(FR-25)은 미구현이라 비활성으로만 노출한다.
     * uiux 2장·8장의 "MVP 미노출" 규칙과 충돌 — 노출 결정 2026-08-11(사용자 지시), 문서 개정 대기.
     */
    timerChip: '타이머',
    timerChipA11y: '수면 타이머, 준비 중',
    scriptChip: '스크립트',
    scriptChipA11y: '스크립트, 준비 중',
    /** 재생 버튼 라벨 — 상태별로 다르다. 완료의 ▶가 "재생"으로만 읽히면 이어듣기로 오해된다 */
    playA11y: '재생',
    pauseA11y: '일시정지',
    replayA11y: '처음부터 다시 재생',
    seekBackA11y: '10초 뒤로',
    seekForwardA11y: '10초 앞으로',
    collapseA11y: '플레이어 축소',
    moreA11y: '더보기',
    bufferingA11y: '재생 준비 중',
    /** 시크바 aria-valuetext — "09:12"가 "영 구 콜론 일 이"로 읽히지 않게 한다(uiux 7장) */
    seekBarA11yValue: (position: string, duration: string) => `${duration} 중 ${position}`,
    completedBadgeA11y: '완청함',
  },

  /** PL4 배속 선택 시트 — 탭 즉시 적용 + 전역 저장 + 닫힘. [확인] 버튼을 두지 않는다 */
  rateSheet: {
    title: '재생 속도',
    optionLabel: (rate: number) => `${rate.toFixed(1)}×`,
    optionA11y: (rate: number) => `${rate.toFixed(1)}배`,
  },

  /** PL7 더보기 시트 — L4·E12와 같은 시트 문법(대상 요약 + 좌측 정렬 액션 + 닫기).
      [상세 정보] 추가(2026-08-23 — 상세 화면 도입 FR-40, 세 화면 더보기 통일) */
  moreSheet: {
    detail: '상세 정보',
    sourceLink: '원문 보기',
    delete: '라이브러리에서 삭제',
    close: '닫기',
  },

  /**
   * PL7 삭제 후 스낵바 — 문구는 라이브러리 소유(library.md 4.5)의 재인용이다.
   * library-uiux.md 4.7 "삭제했어요" + [실행 취소] 5초와 1:1 대조.
   */
  deleteSnackbar: {
    message: '삭제했어요',
    undo: '실행 취소',
    failedToast: '삭제하지 못했어요. 다시 시도해주세요',
  },

  /** PL8 로드 실패 — 화면 유지 + 인라인. 이 시점에는 차감되지 않았다(paywall.md 4.3) */
  loadFailed: {
    title: '재생할 수 없어요',
    description: '잠시 후 다시 시도해주세요',
    retry: '다시 시도',
  },

  /** PL9 회수 — 오류 톤·[다시 시도]를 붙이지 않는다 */
  withdrawn: {
    title: '제공이 종료된 콘텐츠예요',
    close: '닫기',
  },

  /** PL10 재생 중 네트워크 끊김 — 버퍼 소진 시 일시정지 + 하단 배너 */
  networkBanner: '네트워크를 확인해주세요',

  /** 재생 중 서명 URL 갱신 실패 — PL8 문구 재사용(uiux 4.9 제안, 9장 미결) */
  refreshFailedBanner: {
    message: '재생할 수 없어요',
    retry: '다시 시도',
  },

  /** 미니플레이어(PL11) 접근성 — 시각 문자열이 아니라 뜻으로 읽힌다(uiux 7장) */
  miniPlayer: {
    playA11y: '재생',
    pauseA11y: '일시정지',
    expandA11y: (title: string) => `${title}, 플레이어 열기`,
    progressA11y: (totalMin: number, currentMin: number) => `${totalMin}분 중 ${currentMin}분 진행`,
    /** 스와이프 종료의 스크린리더 대체 수단 — 커스텀 액션 라벨(uiux 7장) */
    dismissA11y: '재생 종료',
  },
} as const;
