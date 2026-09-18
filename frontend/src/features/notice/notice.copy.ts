/**
 * 사용자 노출 문구(convention.md 3.5) — settings-uiux.md 4.7 확정 카피와 1:1 대조.
 * 공지 본문 자체는 서버 값이라 여기에 없다. 결제·구독 유도 문구는 공지에 싣지 않는다(4.7 금지).
 */
export const NOTICE_COPY = {
  title: '공지사항',
  backA11y: '뒤로 가기',
  /** 고정 공지 배지 — 색 + 텍스트, 색만으로 구분하지 않는다(settings-uiux.md 7장) */
  pinnedBadge: '중요',
  /** S10 빈 상태 — 발행 공지 0건 */
  empty: '아직 공지가 없어요',
  /** S11 조회 실패 — 전면 오류 + [다시 시도] */
  loadError: '공지를 불러오지 못했어요',
  retry: '다시 시도',
  /** 상세 404(삭제·미발행) — 안내 후 뒤로(settings.md 4.7 규칙 6) */
  deleted: '삭제된 공지예요',
  /** 목록 행 낭독 — "중요, 제목, 날짜" 또는 "제목, 날짜"(settings-uiux.md 4.7 S8) */
  rowA11y: (title: string, date: string, isPinned: boolean): string =>
    isPinned ? `${NOTICE_COPY.pinnedBadge}, ${title}, ${date}` : `${title}, ${date}`,
  /** 스켈레톤 영역 낭독 — 시각 장식이라 내용 대신 상태만 알린다 */
  loadingA11y: '불러오는 중',
} as const;
