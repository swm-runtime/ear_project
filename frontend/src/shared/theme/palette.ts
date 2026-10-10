/**
 * 색 팔레트 — **라이트·다크 두 벌의 실제 값(문자열)**. 다크 값은 iOS 시스템 의미색을 그대로 따른다(PM 2026-10-10
 * "iOS 가 하는 대로" — systemBackground · secondarySystemBackground · label · secondaryLabel …).
 *
 * 값은 전부 JS 에 둔다 — 네이티브 리소스(Android values-night)에 박으면 색을 바꿀 때마다 빌드해야 한다(PM 2026-10-10).
 * 화면은 이 파일을 직접 읽지 않고 `theme.color`(모드에 따라 칠해지는 값)를 쓴다. 문자열이 꼭 필요한 곳(애니메이션 색
 * 보간·SVG·색 조합)만 `useThemePalette()` 로 지금 모드의 값을 받는다(./color-mode).
 */
export interface Palette {
  background: string;
  surface: string;
  /** 블러 위 밝은 덮개 — 미니플레이어와 Android 접힘 바의 글자 대비를 확보한다. */
  frostedSurface: string;
  textPrimary: string;
  textSecondary: string;
  /**
   * 비활성·이미 가진 것의 회색 단계 — iOS systemGray / systemGray2 / systemGray5(KAN-146 PM 확정 2026-10-06).
   * 요금제 관리의 **이용 중 카드**가 쓴다: 이름·가격 `textMuted`, 설명 `textMutedSecondary`, [이용 중] 알약 면 `fillMuted`.
   * 색만으로 상태를 말하지 않는다 — "이용 중" 글자를 함께 둔다(design.md §1)
   */
  textMuted: string;
  textMutedSecondary: string;
  fillMuted: string;
  border: string;
  /** 주 동작 면 — 라이트 검정 · 다크 흰색(애플 뮤직처럼 반전, PM 2026-10-10) */
  primary: string;
  danger: string;
  /**
   * 경고 — **danger 와 쓰임이 다르다.** danger 는 실패·파괴(에러·탈퇴)에, warning 은 **아직 하지 않은 일**
   * (이메일 미인증·미등록)에 쓴다. 이메일이 없는 것은 오류가 아니라 할 일이므로 빨강으로 겁주지 않는다
   */
  warning: string;
  warningSurface: string;
  /**
   * 파괴적 **보조** 버튼의 면 — 연한 빨강 + 빨간 글자(2026-09-28 PM). iOS 의 `.bordered` + red tint 가 이 모양이다.
   * **채운 빨강(`danger`)은 쓰지 않는다** — 주 버튼보다 더 튀어 주·보조가 뒤바뀐다
   */
  dangerSurface: string;
  overlay: string;
  /** 주 동작 면 위의 글자 — primary 의 반대 */
  onPrimary: string;
  /**
   * 사진 위에 놓이는 진행률 바의 채움색 — iOS systemGray(PM 확정 2026-09-22, 후보 6개 비교)
   */
  progress: string;
  /**
   * 분포 그래프 조각 색 — 범주 구분용 유채색. **모노톤 원칙(design.md §1)의 예외다**(데이터 시각화의 범주 색은 애플도
   * 쓴다). 순서대로 상위 항목에 배정하고 마지막은 "기타"용 중립색. 색만으로 구분하지 않는다(범례 텍스트 병기)
   */
  chart: readonly string[];
  /**
   * 사진 위 글자를 읽히게 하는 검정 덮개 — 관심 주제 칩·프로필 관심 주제 카드. 0.42 는 밝은 사진에서 흰 글씨가
   * 묻혔다(실측 2026-09-17). 사진 위라 두 모드 같다
   */
  photoScrim: string;
  /** 사진 위 글자의 그림자 — 덮개와 함께 쓴다 */
  photoTextShadow: string;
  /* ── 화면 테두리·막 — 종전 화면 코드에 직접 박혀 있던 값을 토큰으로(다크 모드, 2026-10-10) ── */
  /** 유리·카드 바깥 얇은 테두리(검정 10%) */
  hairline: string;
  /** 조금 더 진한 테두리(검정 14%) — 유리 알약 윤곽 */
  hairlineStrong: string;
  /** 구분선 — iOS separator(띠 아래 끝·그래프 격자) */
  separator: string;
  /** 옅은 구분선 — 그래프 세로 격자 */
  separatorFaint: string;
  /** 트랙·옅은 면 — iOS tertiarySystemFill(세그먼트 트랙·도넛 바탕) */
  fillTertiary: string;
  /** 유리 위 보조 버튼 면 — iOS secondarySystemFill(확인 다이얼로그) */
  fillSecondary: string;
  /** 유리 캡슐 안 칸 나눔선 */
  divider: string;
  /** 유리 알약 채움(겹친 유리 위) */
  glassPillFill: string;
  /** 유리 림 하이라이트(흰 선) — 다크에선 훨씬 옅게 */
  glassRim: string;
  glassRimStrong: string;
  /** 불투명 캡슐 탭 바 위 선택 알약 */
  tabPillSolid: string;
  /** 사진 칩을 배경 쪽으로 물리는 막 — 라이트 흰 막 · 다크 검정 막 */
  backgroundWash: string;
  /** 주 동작 면 위 보조 글자 — onPrimary 70% */
  onPrimarySecondary: string;
  /**
   * 사진·어두운 막 위 글자·아이콘 — **두 모드 모두 흰색**. onPrimary(주 버튼 위 글자)는 다크에서 검정으로 뒤집히므로
   * 사진 칩·썸네일 위 아이콘·튜토리얼 막·스위치 손잡이에는 이걸 쓴다(다크 모드, 2026-10-10)
   */
  onPhoto: string;
}

export const LIGHT_PALETTE: Palette = {
  background: '#FFFFFF',
  surface: '#F5F5F7',
  frostedSurface: 'rgba(245, 245, 247, 0.72)',
  textPrimary: '#1A1A1E',
  textSecondary: '#6E6E76',
  textMuted: '#8E8E93',
  textMutedSecondary: '#AEAEB2',
  fillMuted: '#E5E5EA',
  border: '#E3E3E8',
  primary: '#000000',
  danger: '#E5484D',
  warning: '#8A5B00',
  warningSurface: '#FFF3CD',
  dangerSurface: '#FDECEC',
  overlay: 'rgba(0, 0, 0, 0.4)',
  onPrimary: '#FFFFFF',
  progress: '#8E8E93',
  chart: ['#4A6CF7', '#8A5CF6', '#39A9DB', '#4CBFA6', '#F2A65A', '#B8BCC9'],
  photoScrim: 'rgba(0, 0, 0, 0.62)',
  photoTextShadow: 'rgba(0, 0, 0, 0.45)',
  hairline: 'rgba(0, 0, 0, 0.10)',
  hairlineStrong: 'rgba(0, 0, 0, 0.14)',
  separator: 'rgba(60, 60, 67, 0.2)',
  separatorFaint: 'rgba(60, 60, 67, 0.1)',
  fillTertiary: 'rgba(118, 118, 128, 0.12)',
  fillSecondary: 'rgba(120, 120, 128, 0.16)',
  divider: 'rgba(0, 0, 0, 0.12)',
  glassPillFill: 'rgba(0, 0, 0, 0.08)',
  glassRim: 'rgba(255, 255, 255, 0.6)',
  glassRimStrong: 'rgba(255, 255, 255, 0.75)',
  tabPillSolid: '#ECECF0',
  backgroundWash: 'rgba(255, 255, 255, 0.76)',
  onPrimarySecondary: 'rgba(255, 255, 255, 0.7)',
  onPhoto: '#FFFFFF',
};

/** 다크 — iOS 시스템 의미색(2026-10-10 PM 확정 팔레트) */
export const DARK_PALETTE: Palette = {
  background: '#000000', // systemBackground
  surface: '#1C1C1E', // secondarySystemBackground
  frostedSurface: 'rgba(28, 28, 30, 0.72)',
  textPrimary: '#FFFFFF', // label
  textSecondary: 'rgba(235, 235, 245, 0.6)', // secondaryLabel
  textMuted: '#8E8E93', // systemGray
  textMutedSecondary: '#636366', // systemGray2
  fillMuted: '#2C2C2E', // systemGray5
  border: '#38383A', // opaqueSeparator
  primary: '#FFFFFF',
  danger: '#FF453A', // systemRed
  warning: '#FF9F0A', // systemOrange
  warningSurface: 'rgba(255, 159, 10, 0.18)',
  dangerSurface: 'rgba(255, 69, 58, 0.18)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  onPrimary: '#000000',
  progress: '#8E8E93',
  chart: ['#6F8BFF', '#A57FFF', '#5BC2F0', '#5FD3B8', '#FFB46E', '#8E8E93'],
  photoScrim: 'rgba(0, 0, 0, 0.62)',
  photoTextShadow: 'rgba(0, 0, 0, 0.45)',
  hairline: 'rgba(255, 255, 255, 0.14)',
  hairlineStrong: 'rgba(255, 255, 255, 0.18)',
  separator: 'rgba(84, 84, 88, 0.65)', // separator(dark)
  separatorFaint: 'rgba(84, 84, 88, 0.35)',
  fillTertiary: 'rgba(118, 118, 128, 0.24)', // tertiarySystemFill(dark)
  fillSecondary: 'rgba(120, 120, 128, 0.32)', // secondarySystemFill(dark)
  divider: 'rgba(255, 255, 255, 0.15)',
  glassPillFill: 'rgba(255, 255, 255, 0.12)',
  glassRim: 'rgba(255, 255, 255, 0.18)',
  glassRimStrong: 'rgba(255, 255, 255, 0.2)',
  tabPillSolid: '#2C2C2E', // systemGray5(dark)
  backgroundWash: 'rgba(0, 0, 0, 0.76)',
  onPrimarySecondary: 'rgba(0, 0, 0, 0.6)',
  onPhoto: '#FFFFFF',
};
