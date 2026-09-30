/**
 * 디자인 토큰. 값은 디자인 확정 전 임시값이다 — wireframe/style.css 토큰은 근거로 삼지
 * 않는다(CLAUDE.md). 다크 모드 대응이 미결이므로 컴포넌트는 이 토큰만 참조한다.
 */
import { Dimensions, Platform } from 'react-native';

/** iOS 26 시스템 탭 바의 좌우 여백(실측) — Android 독 폭이 이 값을 따른다(theme.dock.width) */
const DOCK_SIDE_MARGIN = 21;

export const theme = {
  color: {
    background: '#FFFFFF',
    surface: '#F5F5F7',
    /** 블러 위 밝은 덮개 — 미니플레이어와 Android 접힘 바의 글자 대비를 확보한다. */
    frostedSurface: 'rgba(245, 245, 247, 0.72)',
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
    /**
     * 파괴적 **보조** 버튼의 면 — 연한 빨강 + 빨간 글자(2026-09-28 PM "배경도 살짝 빨간색이어야 하는 거 아니야").
     * iOS 의 `.bordered` + red tint 가 이 모양이다. **채운 빨강(`danger`)은 쓰지 않는다** — 검정 주 버튼보다
     * 더 튀어 주·보조가 뒤바뀐다. `warningSurface` 와 같은 밝기대(임시값 — 디자인 확정 전)
     */
    dangerSurface: '#FDECEC',
    overlay: 'rgba(0, 0, 0, 0.4)',
    onPrimary: '#FFFFFF',
    /**
     * 사진 위에 놓이는 진행률 바의 채움색 — iOS systemGray(PM 확정 2026-09-22, 후보 6개 비교). 흰색은 아래 변
     * 밑의 흰 화면 배경에, 검정(primary)은 그라데이션에 녹아 둘 다 안 보였고, 파랑은 모노톤 앱에서 링크 색처럼
     * 튀었다. 중간 회색은 어두운 띠·흰 배경 양쪽에서 갈리면서 앱의 검정 선 톤을 깨지 않는다
     */
    progress: '#8E8E93',
    /**
     * 분포 그래프 조각 색 — 범주 구분용 유채색. **모노톤 원칙(design.md §1)의 예외다** — 그 원칙은 버튼·선택 같은 강조에
     * 대한 것이고, 데이터 시각화의 범주 색은 애플도 쓴다(스크린 타임·건강). 2026-09-26 03:00 회색 단계로 바꿨다가
     * 03:20 PM "무슨 흑백을 만들고 있었냐"로 20분 만에 되돌렸다. 순서대로 상위 항목에 배정하고 마지막은 "기타"용 중립색.
     * 색만으로 구분하지 않는다는 규칙(범례 텍스트 병기)은 각 화면 uiux가 강제한다
     */
    chart: ['#4A6CF7', '#8A5CF6', '#39A9DB', '#4CBFA6', '#F2A65A', '#B8BCC9'],
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
    /*
     * 떠 있는 하단 독(캡슐 탭 바 · 미니플레이어 카드)의 폭. iOS 26 은 시스템 탭 바라 이 값을 안 쓰고, 그 탭 바는 화면 폭에서
     * 양옆 21pt 씩 뺀 폭이다(PM 2026-09-29 스샷 실측 — 393pt 화면에서 351). **Android 도 같은 규칙**으로 맞춘다
     * (PM 2026-09-29 15:19 "안드로이드 하단 footer·미니플레이어 너비가 iOS 랑 다르다" — 종전 288 고정). 세로 고정 앱이라
     * 시작 때 한 번 재도 된다. iOS 26 미만(캡슐)은 종전 288 그대로
     */
    width: Platform.OS === 'android' ? Dimensions.get('window').width - DOCK_SIDE_MARGIN * 2 : 288,
  },
  touchTarget: {
    minHeight: 44,
    minWidth: 44,
  },
} as const;

export type Theme = typeof theme;

export { motion } from './motion';
