import { Pressable, StyleSheet, View } from 'react-native';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { theme } from '@/shared/theme';
import { SkeletonGroup, SkeletonLine } from '@/shared/ui/Skeleton';
import { Text } from '@/shared/ui/Typography';

import { PLAYER_COPY } from '../player.copy';
import { playerColor } from '../player.theme';

/** 스켈레톤 문단 수와 문단마다의 줄 폭 — 마지막 줄을 짧게 해 문단으로 읽히게 한다 */
const SKELETON_PARAGRAPHS = [
  ['100%', '100%', '62%'],
  ['100%', '84%'],
  ['100%', '100%', '45%'],
] as const;
/** 본문 줄 높이(PlayerScriptPanel `text` — 글자 × 1.55)에서 막대 높이(글자 크기)를 뺀 줄 간격 */
const LINE_GAP = theme.font.size.md * 0.55;

interface PlayerScriptStatusProps {
  /** 실패면 안내 + [다시 시도], 아니면 불러오는 중 */
  isError: boolean;
  onRetry: () => void;
}

/**
 * 대본 패널의 "아직 대본이 없는" 두 상태 — 불러오는 중 · 실패(player-uiux.md 4.6).
 * 불러오는 중은 **대본 문단 모양의 스켈레톤**이다(화자·시각 줄 + 본문 줄 — PlayerScriptPanel 과 같은 여백).
 * 0.3초 안에 오면 아무것도 그리지 않는다. 실패는 재생 목록 패널과 같은 문법이다(안내 한 줄 + [다시 시도]).
 * **재생에는 영향이 없다** — 대본은 부가 화면이라 실패해도 컨트롤은 그대로 동작한다.
 */
export default function PlayerScriptStatus({ isError, onRetry }: PlayerScriptStatusProps) {
  const showSkeleton = useDelayedVisible(!isError);

  if (!isError) {
    return (
      <View style={styles.skeletonArea}>
        {showSkeleton ? (
          <SkeletonGroup
            style={styles.rows}
            color={playerColor.skeleton}
            accessibilityLabel={PLAYER_COPY.scriptSheet.loadingA11y}
          >
            {SKELETON_PARAGRAPHS.map((lines, paragraphIndex) => (
              <View key={paragraphIndex} style={styles.segment}>
                <SkeletonLine width={64} height={theme.font.size.xs} />
                <View style={styles.lines}>
                  {lines.map((width, lineIndex) => (
                    <SkeletonLine key={lineIndex} width={width} height={theme.font.size.md} />
                  ))}
                </View>
              </View>
            ))}
          </SkeletonGroup>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.placeholder} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{PLAYER_COPY.scriptSheet.loadFailed}</Text>
      <Pressable
        style={styles.retry}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={PLAYER_COPY.scriptSheet.retry}
      >
        <Text style={styles.retryLabel}>{PLAYER_COPY.scriptSheet.retry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // PlayerScriptPanel 의 panel·rows·segment 와 같은 여백 — 대본이 들어오는 순간 문단 자리가 움직이지 않게
  skeletonArea: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  rows: {
    paddingTop: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  segment: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  lines: {
    gap: LINE_GAP,
  },
  placeholder: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  text: {
    fontSize: theme.font.size.sm,
    color: playerColor.textSecondary,
  },
  retry: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  retryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: playerColor.primary,
  },
});
