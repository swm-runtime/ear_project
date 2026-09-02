import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { CareerCardVM, SectionState } from '../hooks/useProfileScreen';
import { PROFILE_COPY } from '../profile.copy';
import ProfileCard from './ProfileCard';

interface CareerCardProps {
  state: SectionState<CareerCardVM>;
  onPress: () => void;
  onRetry: () => void;
  isRetrying: boolean;
}

/**
 * [커리어 정보] 카드 — 커리어 정보 화면(career.md) 진입점. 관심사 관리가 아니다(profile-uiux.md 4.5).
 * 입력된 값만 가운데점으로 잇고, 셋 다 없을 때만 미입력 변형이다. [입력하기]는 카드 탭과 같은
 * 목적지의 시각 강조다 — "비어 있음"이 아니라 "할 일"로 읽히게 하기 위한 버튼이라 개별 포커스를
 * 주지 않고 카드 한 문장에 포함한다.
 */
export default function CareerCard({ state, onPress, onRetry, isRetrying }: CareerCardProps) {
  const hasError = state.kind === 'error';
  const vm = state.kind === 'data' ? state.data : null;
  const line = vm === null ? '' : PROFILE_COPY.career.line(vm.career);
  return (
    <ProfileCard
      label={PROFILE_COPY.cardLabels.career}
      onPress={onPress}
      a11yLabel={
        vm === null
          ? null
          : PROFILE_COPY.cardA11y(
              PROFILE_COPY.cardLabels.career,
              vm.isEmpty ? PROFILE_COPY.career.emptyPrompt : line,
              PROFILE_COPY.destinations.career,
            )
      }
      hasError={hasError}
      onRetry={onRetry}
      isRetrying={isRetrying}
    >
      {vm !== null ? (
        vm.isEmpty ? (
          <View style={styles.emptyRow}>
            <Text style={styles.prompt}>{PROFILE_COPY.career.emptyPrompt}</Text>
            <View style={styles.emptyAction}>
              <Text style={styles.emptyActionText}>{PROFILE_COPY.career.emptyAction}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.line}>{line}</Text>
        )
      ) : null}
    </ProfileCard>
  );
}

const styles = StyleSheet.create({
  line: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  prompt: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
    flexShrink: 1,
  },
  emptyAction: {
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  emptyActionText: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
