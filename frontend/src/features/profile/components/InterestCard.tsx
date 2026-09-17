import { Image, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { topicImageSource } from '@/features/interest';

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
 *
 * 칩 시각은 온보딩 1단계·관심사 관리의 알약과 같다 — 사진 배경 + 어두운 오버레이 + 흰 라벨
 * (`TopicChip`). 같은 주제를 세 화면에서 서로 다른 모양으로 보여주면 같은 것으로 읽히지 않는다.
 * 여기서는 `TopicChip`을 쓰지 않고 사진만 빌려 온다 — 그쪽은 체크박스(선택 토글)라
 * 표시 전용인 이 카드에 쓰면 낭독기가 "선택 안 됨"으로 읽는다.
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
      labelAccessory={
        state.kind === 'data' ? (
          <Text style={styles.count}>{PROFILE_COPY.interest.count(state.data.count)}</Text>
        ) : undefined
      }
    >
      {state.kind === 'data' ? (
        <View style={styles.chips}>
          {state.data.topTopics.map((topic) => (
            <View key={topic.id} style={styles.chip}>
              <Image
                source={topicImageSource(topic.name)}
                resizeMode="cover"
                style={styles.photo}
              />
              <View style={styles.overlay} />
              <Text style={styles.chipText} numberOfLines={1}>
                {topic.name}
              </Text>
            </View>
          ))}
          {state.data.overflowCount !== null ? (
            // "외 N개"는 주제가 아니다 — 사진을 깔면 없는 주제의 사진처럼 읽힌다
            <View style={[styles.chip, styles.overflowChip]}>
              <Text style={[styles.chipText, styles.overflowText]} numberOfLines={1}>
                {PROFILE_COPY.interest.overflow(state.data.overflowCount)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </ProfileCard>
  );
}

const styles = StyleSheet.create({
  count: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    // 알약 — 사진·오버레이 클리핑은 여기서 한 번만 한다(TopicChip과 같은 구조)
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    /*
     * **패딩을 칩이 갖지 않는다.** 배경 사진의 `width/height: '100%'`가 부모의 콘텐츠
     * 박스(패딩 제외)로 풀려서, 칩에 패딩이 있으면 알약 가장자리에 배경이 드러난다
     * (TopicChip이 iOS 실기기에서 겪은 것과 같은 문제). 좌우 여백은 아래 chipText가 갖는다.
     */
  },
  /** 배경 사진 — inset과 퍼센트 크기를 함께 준다(웹에서 inset만으로는 원본 크기가 남는다) */
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  /**
   * 사진 위 가독성용 오버레이 — **`TopicChip`의 선택 상태(0.62)와 같은 값**이다.
   *
   * 0.42로는 밝은 주제 사진(예: 생산성)에서 흰 글씨가 묻혔다(실측 2026-09-17, 390×844).
   * 온보딩 칩의 기본값 0.34보다도 더 짙어야 하는 이유는 둘이다 — 라벨이 `xs`(12)로 절반이고,
   * 칩 높이가 30이라 사진의 밝은 한 구역이 알약을 통째로 채운다.
   *
   * 선택 상태 값을 고른 것은 대비 때문만이 아니다. 이 카드가 보여 주는 것이 **사용자가 고른
   * 주제**라, 온보딩에서 선택된 칩과 같은 농도로 읽히는 쪽이 맞다.
   */
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  overflowChip: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  chipText: {
    // 칩이 아니라 라벨이 좌우 여백을 갖는다 — 위 chip 주석 참조
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.onPrimary,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  overflowText: {
    fontWeight: '600',
    color: theme.color.textSecondary,
    textShadowColor: 'transparent',
  },
});
