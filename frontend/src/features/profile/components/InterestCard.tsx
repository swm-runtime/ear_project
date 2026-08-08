import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { InterestCardVM, SectionState } from '../hooks/useProfileScreen';
import { PROFILE_COPY } from '../profile.copy';
import ProfileCard from './ProfileCard';

interface InterestCardProps {
  state: SectionState<InterestCardVM>;
  onPress: () => void;
  onRetry: () => void;
  isRetrying: boolean;
}

/** "관심 주제 관리, 4개 선택, 커리어, 자기계발, 경제 외 1개, 관심사 관리 열기"(profile-uiux.md 7장) */
const cardA11y = (vm: InterestCardVM): string =>
  PROFILE_COPY.cardA11y(
    PROFILE_COPY.cardLabels.interest,
    [
      PROFILE_COPY.interest.count(vm.count),
      vm.topTopics.map((topic) => topic.name).join(', '),
      ...(vm.overflowCount !== null ? [PROFILE_COPY.interest.overflowA11y(vm.overflowCount)] : []),
    ].join(', '),
    PROFILE_COPY.destinations.interest,
  );

/**
 * [관심 주제 관리] 카드 — 관심사 관리 화면 진입점(profile-uiux.md 4.5).
 * 칩은 표시 전용이다 — 탭해도 개별 편집이 아니라 카드와 같은 목적지다(개별 편집을 열면
 * 저장 규칙이 두 벌이 된다). 대표 3개는 서버 응답 순서의 앞 3개 그대로다.
 */
export default function InterestCard({ state, onPress, onRetry, isRetrying }: InterestCardProps) {
  const hasError = state.kind === 'error';
  return (
    <ProfileCard
      label={PROFILE_COPY.cardLabels.interest}
      onPress={onPress}
      a11yLabel={hasError ? null : cardA11y(state.data)}
      hasError={hasError}
      onRetry={onRetry}
      isRetrying={isRetrying}
    >
      {state.kind === 'data' ? (
        <View style={styles.content}>
          <Text style={styles.count}>{PROFILE_COPY.interest.count(state.data.count)}</Text>
          <View style={styles.chips}>
            {state.data.topTopics.map((topic) => (
              <View key={topic.id} style={styles.chip}>
                <Text style={styles.chipText}>{topic.name}</Text>
              </View>
            ))}
            {state.data.overflowCount !== null ? (
              <View style={[styles.chip, styles.overflowChip]}>
                <Text style={styles.chipText}>
                  {PROFILE_COPY.interest.overflow(state.data.overflowCount)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </ProfileCard>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.sm,
  },
  count: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    backgroundColor: theme.color.background,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  overflowChip: {
    backgroundColor: theme.color.surface,
  },
  chipText: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
});
