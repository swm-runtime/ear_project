import { localized, type LocalizedCopy } from '@/shared/i18n/localized';

/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 content-detail-uiux.md 6장과 1:1 대조한다.
 * TODO 표시 항목은 uiux 6장의 "제안 문자열 — 카피 미확정" 표에 있는 값 — 확정 시 교체한다.
 * 재생 확인 팝업·페이월·잔여 표시 카피는 player가 소유한다(PLAYER_COPY) — 여기 두지 않는다.
 */
const ko = {
  /* TODO(카피 미확정 — uiux 9장): 더보기 시트 항목명을 그대로 쓴 시안 임시값 */
  appBarTitle: '상세 정보',
  backA11y: '뒤로가기',

  /* TODO(카피 미확정 — uiux 6장): 소개·메타 라벨 */
  introLabel: '소개',
  meta: {
    duration: '길이',
    publishedAt: '발행일',
    series: '시리즈',
  },

  /** 헤더 액션(content-detail.md 4.4 — 확정 카피) */
  actions: {
    play: '재생',
    save: '담기',
    delete: '삭제',
    /** 낭독 라벨 — 무엇에 담고 무엇에서 삭제되는지 드러낸다(uiux 7장) */
    saveA11y: '라이브러리에 담기',
    deleteA11y: '라이브러리에서 삭제',
  },

  /** 담기 완료 — explore와 같은 구성([보러가기] 포함, 확정 2026-08-23 — uiux 4.3) */
  saveToast: '라이브러리에 담았어요',
  saveToastAction: '보러가기',
  /** 실패는 원상 유지 + 토스트(uiux 4.3 — common-error-handling.md 4.4와 같은 규칙) */
  saveFailedToast: '담지 못했어요. 다시 시도해주세요',
  deleteFailedToast: '삭제하지 못했어요. 다시 시도해주세요',
  /** 삭제 성공은 무음(버튼 전환이 피드백) — 스크린리더에만 polite로 한 번 알린다(uiux 7장) */
  deletedA11yAnnounce: '라이브러리에서 삭제했어요',

  /** 회수 안내 — 세 화면 공통 문자열(uiux 6장). 서버 message가 오면 그것을 우선한다 */
  withdrawnToast: '제공이 종료된 콘텐츠예요',

  /** CD3 전면 에러 — 문구는 공통 규약을 따른다(common-error-handling.md 소유, uiux 4.7) */
  error: {
    networkTitle: '인터넷 연결을 확인해주세요',
    loadFailedTitle: '일시적인 오류가 발생했어요',
    loadFailedDescription: '잠시 후 다시 시도해주세요',
    retry: '다시 시도',
  },
} as const;

const en: LocalizedCopy<typeof ko> = {
  appBarTitle: 'Details',
  backA11y: 'Back',

  introLabel: 'About',
  meta: {
    duration: 'Length',
    publishedAt: 'Published',
    series: 'Series',
  },

  actions: {
    play: 'Play',
    save: 'Save',
    delete: 'Remove',
    saveA11y: 'Add to Library',
    deleteA11y: 'Remove from Library',
  },

  saveToast: 'Added to Library',
  saveToastAction: 'View',
  saveFailedToast: "Couldn't add. Please try again.",
  deleteFailedToast: "Couldn't remove. Please try again.",
  deletedA11yAnnounce: 'Removed from Library',

  withdrawnToast: 'This episode is no longer available',

  error: {
    networkTitle: 'Check your internet connection',
    loadFailedTitle: 'Something went wrong',
    loadFailedDescription: 'Please try again later.',
    retry: 'Try again',
  },
};

export const CONTENT_DETAIL_COPY = localized({ ko, en });
