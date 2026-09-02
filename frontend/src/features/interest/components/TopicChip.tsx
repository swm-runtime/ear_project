import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/shared/theme';

/**
 * 주제별 아이콘 — 순수 표현이라 화면이 소유한다(서버 계약에 아이콘 필드가 없다).
 * 목록에 없는 주제(관리자가 새로 추가한 주제)는 FALLBACK_ICON으로 떨어진다.
 */
const TOPIC_ICON: Record<string, string> = {
  'topic-career': '💼',
  'topic-productivity': '⚡',
  'topic-economy': '📈',
  'topic-tech': '💻',
  'topic-ai': '🤖',
  'topic-marketing': '📣',
  'topic-design': '🎨',
  'topic-startup': '🚀',
  'topic-psychology': '🧠',
  'topic-leadership': '🧭',
};

const FALLBACK_ICON = '🎧';

interface TopicChipProps {
  label: string;
  /** 아이콘 조회 키 — 없으면 기본 아이콘을 쓴다. 선택 동작에는 관여하지 않는다 */
  topicId?: string;
  isSelected: boolean;
  /** 상한을 채운 뒤의 미선택 칩 — 비활성 스타일을 입히되 탭은 받아 토스트를 띄운다(uiux 공통 규칙) */
  isDimmed: boolean;
  /** 비활성 이유의 낭독 힌트 — IM2는 상한 토스트, IM6은 초과 안내 문구를 쓴다(interest-management-uiux.md 7장) */
  dimmedHint?: string;
  onPress: () => void;
}

/**
 * 주제 선택 칩 — 온보딩 1단계와 관심사 관리가 같은 컴포넌트를 쓴다
 * (interest-management-uiux.md 5장 — 같은 목록·같은 순서·같은 칩 동작).
 */
export default function TopicChip({
  label,
  topicId,
  isSelected,
  isDimmed,
  dimmedHint,
  onPress,
}: TopicChipProps) {
  const icon = (topicId && TOPIC_ICON[topicId]) || FALLBACK_ICON;

  return (
    <Pressable
      style={[styles.chip, isSelected && styles.chipSelected, isDimmed && styles.chipDimmed]}
      onPress={onPress}
      accessibilityRole="checkbox"
      // disabled를 선언하지 않는다 — 상한 도달 칩도 탭을 받아 토스트를 띄우는 것이 규칙인데(uiux 4.1),
      // disabled로 알리면 낭독기 사용자는 "사용 안 함"으로 듣고 아예 누르지 않아 그 안내를 못 받는다.
      // 이유는 아래 hint로 미리 알린다.
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={label}
      accessibilityHint={isDimmed ? dimmedHint : undefined}
    >
      {/* 아이콘은 장식이다 — 주제 이름을 이미 낭독하므로 따로 읽지 않는다(uiux 7장) */}
      <Text style={[styles.icon, isDimmed && styles.iconDimmed]} importantForAccessibility="no">
        {icon}
      </Text>
      <Text
        style={[styles.label, isSelected && styles.labelSelected, isDimmed && styles.labelDimmed]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    /*
     * 2열 격자 — 내용 폭에 맡기면 한 줄에 2개가 들어가고도 오른쪽이 크게 남는다.
     * 40%를 바닥으로 두고 남는 폭을 나눠 가지면 세 번째는 못 들어오고(120%),
     * 두 칸이 같은 폭으로 늘어 좌우 끝이 모두 맞는다(2026-09-02).
     * 마지막 홀수 칸은 한 줄을 다 쓴다 — 빈 칸을 남기는 것보다 낫다.
     */
    flexGrow: 1,
    flexBasis: '40%',
    flexDirection: 'row',
    alignItems: 'center',
    // 칸 폭이 글자 수와 무관해졌으므로 내용을 가운데 세운다
    justifyContent: 'center',
    gap: theme.spacing.sm,
    // 칩은 글자 수에 따라 폭이 달라지므로 최소 높이를 고정한다(uiux 7장 — 터치 타깃 44pt)
    minHeight: theme.touchTarget.minHeight + theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    // 알약 — 높이가 바뀌어도 양 끝이 항상 반원이 된다
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    backgroundColor: theme.color.background,
  },
  chipSelected: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.primary,
  },
  chipDimmed: {
    backgroundColor: theme.color.surface,
  },
  icon: {
    fontSize: theme.font.size.lg,
  },
  // 흐린 칩은 아이콘까지 함께 물러나야 한 덩어리로 읽힌다
  iconDimmed: {
    opacity: 0.4,
  },
  label: {
    fontSize: theme.font.size.md,
    // 선택 여부와 무관하게 굵기를 고정한다 — 선택 시 굵어지면 칩 폭이 변해
    // flexWrap 그리드 전체가 재배치되고, 연속으로 고르는 동안 표적이 움직인다
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  labelSelected: {
    color: theme.color.onPrimary,
  },
  labelDimmed: {
    color: theme.color.textSecondary,
  },
});
