import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';

import { useCompleteScreen } from '../hooks/useCompleteScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';

/**
 * O9 완료 — 주제 요약. 인디케이터를 그리지 않는다(onboarding-uiux.md 4.6).
 * 선택한 주제를 칩으로 그대로 되비추는 것이 이 화면의 유일한 기능이다.
 */
export default function CompleteScreen() {
  const { topicNames, isProcessing, handleStartPress } = useCompleteScreen();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.title}>{ONBOARDING_COPY.complete.title}</Text>

        <View style={styles.chipRow}>
          {topicNames.map((name) => (
            <View key={name} style={styles.topicChip}>
              <Text style={styles.topicChipLabel}>{name}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.dripNotice}>{ONBOARDING_COPY.complete.dripNotice}</Text>
        {/* 드립 편수와 재생 한도가 같다는 것을 여기서 알린다(onboarding-uiux.md 4.6, PRD FR-14) */}
        <Text style={styles.tierNotice}>{ONBOARDING_COPY.complete.tierNotice}</Text>
      </View>

      <Pressable
        style={styles.start}
        disabled={isProcessing}
        onPress={() => void handleStartPress()}
        accessibilityRole="button"
        accessibilityLabel={ONBOARDING_COPY.complete.start}
        accessibilityState={{ disabled: isProcessing }}
      >
        {isProcessing ? (
          <ActivityIndicator color={theme.color.onPrimary} />
        ) : (
          <Text style={styles.startLabel}>{ONBOARDING_COPY.complete.start}</Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.lg,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  topicChip: {
    minHeight: theme.touchTarget.minHeight - theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg + theme.radius.sm,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicChipLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  dripNotice: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  tierNotice: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  start: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  startLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
