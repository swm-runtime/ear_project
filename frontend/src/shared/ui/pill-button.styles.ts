import { StyleSheet } from 'react-native';

import { theme } from '@/shared/theme';

/**
 * **글자가 들어간 행동 버튼의 공용 모양 — 알약(캡슐)**(design.md §2 "텍스트 버튼 = 알약", KAN-146 2026-10-06).
 * iOS 26 문법: 버튼은 캡슐, 면(입력창·카드·배너·목록 행·토스트·시트 몸체)은 둥근 사각이다. 아이콘 원형 버튼·배경 없는
 * 글자 링크는 대상이 아니다.
 *
 * 종전에는 화면마다 `borderRadius: md` 버튼을 따로 정의해 모양이 섞였다(알약·12pt 사각이 한 화면에 같이 있었다).
 * **모양(모서리·곡률·가운데 정렬)과 역할 색만 여기서 정하고, 크기(높이·폭·여백·flex)는 각 화면이 정한다** —
 * 화면마다 높이가 다른 것(44·52·56)은 의도이고, 이 스타일은 높이를 바꾸지 않는다.
 *
 * 쓰는 법: `style={[pillButton.base, pillButton.primary, styles.<화면 크기>, disabled && styles.<비활성>]}` —
 * 화면의 비활성 면(`border` 회색 등)이 역할 색을 덮도록 **뒤에** 둔다.
 */
export const pillButton = StyleSheet.create({
  /** 모양 — 반원 양 끝 + 연속 곡률(iOS 만 적용, Android 는 원호) */
  base: {
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 주 동작 — 검정 채움 */
  primary: {
    backgroundColor: theme.color.primary,
  },
  /** 보조 동작 — 테두리 없는 연한 면(design.md §5 — 검정 버튼 옆에서 선으로 그린 상자는 낡아 보인다) */
  secondary: {
    backgroundColor: theme.color.surface,
  },
  /** 파괴적 **주** 동작 — 채운 빨강(확인 다이얼로그의 [로그아웃]·탈퇴 [탈퇴하기]). 보조 자리에는 쓰지 않는다 */
  destructive: {
    backgroundColor: theme.color.danger,
  },
  /** 파괴적 **보조** 동작 — 연한 빨강 면 + 빨간 글자(iOS `.bordered` + red tint). 콘텐츠 상세 [삭제] */
  destructiveSecondary: {
    backgroundColor: theme.color.dangerSurface,
  },
  primaryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  secondaryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  /** 채운 빨강 위의 글자 — 흰색 */
  destructiveLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  destructiveSecondaryLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.danger,
  },
});
