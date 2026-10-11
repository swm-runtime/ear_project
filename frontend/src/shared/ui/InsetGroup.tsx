import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

interface InsetGroupProps {
  /** 그룹 위 제목 — 없으면 묶음만 그린다(최종 확인 체크처럼 제목이 필요 없는 묶음) */
  title?: string;
  children: ReactNode;
  /** 그룹 아래 설명(iOS 설정의 그룹 꼬리말) — 보조색 작은 글자 */
  footer?: string;
  /** 묶음의 낭독 역할 — 체크 목록이면 radiogroup */
  bodyRole?: 'radiogroup';
}

/**
 * **인셋 그룹 리스트의 한 그룹** — 제목 + 항목 묶음 + 꼬리말(iOS 설정 문법, design.md §5 "설정 목록").
 * 설정 화면이 `SettingsSection` 으로 쓰던 것을 회원 탈퇴 화면도 쓰게 되어 공용으로 올렸다(2026-10-10).
 *
 * 연한 면(`surface`)과 `xl` 연속 곡률로 항목을 묶고, 안쪽 구분선과 보조 라벨로 위계를 만든다.
 * 행의 모양(높이·여백·탭 영역)은 각 행 컴포넌트가 정한다 — 그룹은 묶음과 구분선만 소유한다.
 */
export default function InsetGroup({ title, children, footer, bodyRole }: InsetGroupProps) {
  // null·false 자식은 걸러진다 — 조건부 행 사이에 구분선이 두 번 그어지지 않는다
  const items = Children.toArray(children);

  return (
    <View style={styles.section}>
      {title !== undefined ? (
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={styles.body} accessibilityRole={bodyRole}>
        {items.map((item, index) => (
          <View key={index}>
            {/* 첫 항목 위에는 긋지 않는다 — 제목이 밑줄 그어진 것처럼 보인다 */}
            {index > 0 ? <View style={styles.divider} pointerEvents="none" /> : null}
            {item}
          </View>
        ))}
      </View>
      {footer !== undefined ? (
        <Text style={styles.footer} lineBreakStrategyIOS="hangul-word">
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
  },
  // 프로필 카드의 보조 라벨과 같은 크기, 행의 글자 시작점과 같은 들여쓰기.
  title: {
    fontSize: theme.font.size.xs,
    fontWeight: '500',
    color: theme.color.textSecondary,
    paddingHorizontal: theme.spacing.md,
  },
  // 제목과 같은 들여쓰기·같은 톤. 여러 줄이면 그대로 감싼다
  footer: {
    fontSize: theme.font.size.xs,
    lineHeight: theme.font.size.xs * 1.5,
    color: theme.color.textSecondary,
    paddingHorizontal: theme.spacing.md,
  },
  body: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  // 항목 글자와 같은 선에서 시작한다 — 왼쪽 끝까지 그으면 섹션 경계와 구분되지 않는다
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: theme.spacing.md,
    marginRight: theme.spacing.md,
    backgroundColor: theme.color.border,
  },
});
