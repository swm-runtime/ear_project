import { StyleSheet } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { topicImageSource } from '@/features/interest';

import type { InterestCardVM, SectionState } from '../hooks/useProfileScreen';
import { PROFILE_COPY } from '../profile.copy';
import ProfileCard from './ProfileCard';
import ProfilePhotoStack from './ProfilePhotoStack';

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
 * 사진은 표시 전용이다 — 탭해도 카드와 같은 관심사 관리 화면으로 이동한다.
 * 대표 3개는 서버 응답 순서 그대로이며, 주제명·초과 개수는 접근성 라벨로 유지한다.
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
      inline
      labelAccessory={
        state.kind === 'data' ? (
          <Text style={styles.count}>{PROFILE_COPY.interest.count(state.data.count)}</Text>
        ) : undefined
      }
    >
      {state.kind === 'data' ? (
        <ProfilePhotoStack
          photos={state.data.topTopics.map((topic) => ({
            id: topic.id,
            source: topicImageSource(topic.name),
          }))}
        />
      ) : null}
    </ProfileCard>
  );
}

const styles = StyleSheet.create({
  count: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
});
