/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 settings-uiux.md 6장과 1:1 대조한다.
 * 이메일 상태·구독 요약 문구는 프로필과 완전히 같은 문자열을 쓴다(settings-uiux.md 6장 —
 * 두 화면이 같은 값을 다른 말로 표시하면 어느 쪽이 맞는지 사용자가 판단하게 된다).
 * 내부 용어("드립"·"티어"·"유예"·"grace")를 노출하지 않는다.
 */
import { NOTIFICATION_COPY } from '@/features/notification';

import { toMonthDayParts } from './settings.format';

const monthDay = (iso: string): string => {
  const { month, day } = toMonthDayParts(iso);
  return `${month}월 ${day}일`;
};

export const SETTINGS_COPY = {
  title: '설정',
  backA11y: '뒤로 가기',

  /** 섹션 제목(settings-uiux.md 4.1 골격) */
  sections: {
    account: '계정',
    subscription: '구독',
    content: '콘텐츠',
    playback: '재생',
    notification: '알림',
    info: '정보',
    support: '지원',
    admin: '관리자',
  },

  email: {
    label: '이메일',
    unregistered: '등록되지 않음',
    /** 배지 — 색 + 텍스트. 색만으로 구분하지 않는다(settings-uiux.md 5장) */
    unverifiedBadge: '인증되지 않음',
    register: '등록',
    verify: '인증하기',
    change: '변경',
    unverifiedValueA11y: (email: string) => `${email}, 인증되지 않음`,
  },

  plan: {
    /** N은 서버 daily_play_limit — 하드코딩하지 않는다(paywall.md 5장). null은 무제한 */
    free: (dailyPlayLimit: number | null) =>
      dailyPlayLimit === null ? '무료 이용 중' : `무료 이용 중 · 하루 ${dailyPlayLimit}편`,
    freeAction: '구독 알아보기',
    renewsAt: (iso: string) => `다음 결제일 ${monthDay(iso)}`,
    /** 해지 예약 — 중립 톤. 사용자가 스스로 내린 결정이지 장애가 아니다(settings-uiux.md 4.1) */
    cancelScheduled: (iso: string) => `${monthDay(iso)}까지 이용 가능`,
    /** 결제 문제 — 경고색을 쓰는 유일한 플랜 상태(profile.md 4.2·subscription.md 4.7과 동일) */
    paymentIssue: '결제에 문제가 있어요',
    a11y: '구독 관리 열기',
  },

  content: {
    interest: '관심 주제 관리',
    interestCount: (count: number) => `${count}개 선택`,
    career: '커리어 정보',
  },

  playback: {
    rate: '기본 배속',
    rateValue: (rate: number) => `${rate}×`,
    sheetTitle: '기본 배속',
  },

  notification: {
    /** "PICK"은 전부 대문자다(합의 2026-08-06, notification.md 4.2) */
    dripToggle: '이어 PICK 알림',
    marketingToggle: '마케팅 수신 동의',
    /** 유도 배너 — 사전 안내의 헤드라인 그대로(settings-uiux.md 4.3) */
    banner: NOTIFICATION_COPY.prePrompt.title,
    bannerA11y: `${NOTIFICATION_COPY.prePrompt.title}, 알림 설정 열기`,
    /** S4 — OS 권한이 거부된 상태의 토글 ON 시도(settings-uiux.md 4.3) */
    permissionTitle: '기기 설정에서 알림을 허용해주세요',
    permissionOpen: '설정 열기',
    permissionClose: '닫기',
  },

  info: {
    notice: '공지사항',
    terms: '이용약관',
    privacy: '개인정보처리방침',
    version: '앱 버전',
    updateBadge: '업데이트 있음',
    update: '업데이트',
    versionA11y: (version: string, hasUpdate: boolean) =>
      hasUpdate ? `앱 버전 ${version}, 업데이트 있음` : `앱 버전 ${version}`,
  },

  support: {
    contact: '문의하기',
    /** 카카오톡 채널을 열 수 없을 때의 폴백(settings.md 7장) */
    contactFallbackTitle: '카카오톡 채널을 열 수 없어요',
    contactCopy: '복사',
    contactClose: '닫기',
    copied: '링크를 복사했어요',
  },

  account: {
    logout: '로그아웃',
    logoutConfirmTitle: '로그아웃할까요?',
    logoutCancel: '취소',
    logoutConfirm: '로그아웃',
    withdraw: '회원 탈퇴',
  },

  admin: {
    /** 운영자용 진입점에 설명을 붙이지 않는다(settings-uiux.md 6장) */
    menu: '관리자',
  },

  /** S7 토글 저장 실패 — 조용히 되돌리지 않는다(common-error-handling.md 4.4) */
  saveError: '설정을 저장하지 못했어요',

  /** S6 조회 실패 — 계정·구독 카드 영역에만. 나머지 메뉴는 정상 동작한다 */
  summaryError: '정보를 불러올 수 없어요',
  retry: '다시 시도',
} as const;
