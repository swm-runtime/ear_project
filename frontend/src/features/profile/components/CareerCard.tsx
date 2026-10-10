import { StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import { jobCategoryImageSource } from '@/features/career';

import type { CareerCardVM, SectionState } from '../hooks/useProfileScreen';
import { PROFILE_COPY } from '../profile.copy';
import ProfileCard from './ProfileCard';
import ProfilePhotoStack from './ProfilePhotoStack';

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
      // 라벨 아래 "기획 · 서비스 기획 · 4-6년" 줄은 뺐다(PM 2026-10-11 03:28) — 직군 사진만. 값은 낭독에만 남긴다
      inline={vm !== null && !vm.isEmpty}
    >
      {vm !== null ? (
        vm.isEmpty ? (
          <View style={styles.emptyRow}>
            <Text style={styles.prompt}>{PROFILE_COPY.career.emptyPrompt}</Text>
            <View style={[pillButton.base, pillButton.primary, styles.emptyAction]}>
              <Text style={styles.emptyActionText}>{PROFILE_COPY.career.emptyAction}</Text>
            </View>
          </View>
        ) : vm.career.jobCategory !== null ? (
          <ProfilePhotoStack
            photos={[
              {
                id: vm.career.jobCategory,
                source: jobCategoryImageSource(vm.career.jobCategory),
              },
            ]}
          />
        ) : null
      ) : null}
    </ProfileCard>
  );
}

const styles = StyleSheet.create({
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
  // 버튼 모양 칩 — 공용 알약(pillButton, design.md §2). 09-26 전엔 sm 8 의 작은 사각이었고, 10-06 md 12 에서 알약으로
  emptyAction: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  emptyActionText: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
