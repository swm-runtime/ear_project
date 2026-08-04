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
    primary: '#4A6CF7',
    danger: '#E5484D',
    overlay: 'rgba(0, 0, 0, 0.4)',
    onPrimary: '#FFFFFF',
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
