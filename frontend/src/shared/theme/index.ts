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
    overlay: 'rgba(0, 0, 0, 0.4)',
    onPrimary: '#FFFFFF',
    /** 분포 그래프 조각 색(임시값) — 순서대로 상위 항목에 배정하고 마지막은 "기타"용 중립색이다.
        색만으로 구분하지 않는다는 규칙(범례 텍스트 병기)은 각 화면 uiux가 강제한다 */
    chart: ['#4A6CF7', '#8A5CF6', '#39A9DB', '#4CBFA6', '#F2A65A', '#B8BCC9'],
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
    },
  },
  /** auth-uiux.md 7 — 터치 타깃 최소 44pt */
  touchTarget: {
    minHeight: 44,
    minWidth: 44,
  },
} as const;

export type Theme = typeof theme;
