/**
 * 디자인 토큰. 값은 디자인 확정 전 임시값이다 — wireframe/style.css 토큰은 근거로 삼지
 * 않는다(CLAUDE.md). 다크 모드 대응이 미결이므로 컴포넌트는 이 토큰만 참조한다.
 */
export const theme = {
  color: {
    background: '#FFFFFF',
    surface: '#F5F5F7',
    textPrimary: '#1A1A1E',
    textSecondary: '#6E6E76',
    border: '#E3E3E8',
    primary: '#000000',
    danger: '#E5484D',
    /**
     * 경고 — **danger 와 쓰임이 다르다.** danger 는 실패·파괴(에러·탈퇴)에,
     * warning 은 **아직 하지 않은 일**(이메일 미인증·미등록)에 쓴다. 이메일이 없는 것은
     * 오류가 아니라 할 일이므로 빨강으로 겁주지 않는다. (임시값 — 디자인 확정 전)
     */
    warning: '#8A5B00',
    warningSurface: '#FFF3CD',
    overlay: 'rgba(0, 0, 0, 0.4)',
    onPrimary: '#FFFFFF',
    /**
     * 사진 위에 놓이는 진행률 바의 채움색 — iOS systemGray(PM 확정 2026-09-22, 후보 6개 비교). 흰색은 아래 변
     * 밑의 흰 화면 배경에, 검정(primary)은 그라데이션에 녹아 둘 다 안 보였고, 파랑은 모노톤 앱에서 링크 색처럼
     * 튀었다. 중간 회색은 어두운 띠·흰 배경 양쪽에서 갈리면서 앱의 검정 선 톤을 깨지 않는다
     */
    progress: '#8E8E93',
    /**
     * 분포 그래프 조각 색 — **회색 단계**(design.md §1: 앱은 모노톤, 유채색 강조를 두지 않는다. 2026-09-26 프로필 정비
     * 전까지는 파랑·보라·민트·주황 팔레트였다). 순서대로 상위 항목에 배정하고 마지막은 "기타"용 가장 옅은 색이다.
     * 값은 textPrimary · textSecondary · iOS systemGray · gray2 · gray3 · gray5. 조각 사이는 흰 틈으로 가른다(TopicDonut) —
     * 색만으로 구분하지 않는다는 규칙(범례 텍스트 병기)은 각 화면 uiux가 강제한다
     */
    chart: ['#1A1A1E', '#6E6E76', '#8E8E93', '#AEAEB2', '#C7C7CC', '#E5E5EA'],
    /**
     * 사진 위 글자를 읽히게 하는 검정 덮개 — 관심 주제 칩(선택 상태)·프로필 관심 주제 카드가 같은 값을 쓴다.
     * 0.42 는 밝은 사진(생산성)에서 흰 글씨가 묻혔다(실측 2026-09-17, 390×844)
     */
    photoScrim: 'rgba(0, 0, 0, 0.62)',
    /** 사진 위 글자의 그림자 — 덮개와 함께 쓴다 */
    photoTextShadow: 'rgba(0, 0, 0, 0.45)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    /** 다이얼로그·바텀시트의 모서리. 면이 큰 표면일수록 곡률을 키워야 같은 부드러움으로 읽힌다 */
    xl: 24,
    /** 알약(양 끝이 반원). 높이가 바뀌어도 항상 반원이 되도록 충분히 큰 값을 둔다 */
    full: 999,
  },
  font: {
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 28,
      /** iOS 큰 제목(Large Title) — 콘텐츠 안 제목 줄(LargeTitleRow) */
      xxl: 34,
    },
  },
  /** auth-uiux.md 7 — 터치 타깃 최소 44pt */
  /** 하단 독 — 캡슐 탭 바와 미니플레이어 카드가 같은 폭으로 가운데 선다(2026-09-23 PM). 칸 96 × 3 */
  dock: {
    width: 288,
  },
  touchTarget: {
    minHeight: 44,
    minWidth: 44,
  },
} as const;

export type Theme = typeof theme;

export { motion } from './motion';
