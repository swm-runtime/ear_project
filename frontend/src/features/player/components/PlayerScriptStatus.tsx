import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { PLAYER_COPY } from '../player.copy';
import { playerColor } from '../player.theme';

interface PlayerScriptStatusProps {
  /** 실패면 안내 + [다시 시도], 아니면 불러오는 중 */
  isError: boolean;
  onRetry: () => void;
}

/**
 * 대본 패널의 "아직 대본이 없는" 두 상태 — 불러오는 중 · 실패(player-uiux.md 4.6).
 * 재생 목록 패널과 같은 문법이다(안내 한 줄 + [다시 시도]). **재생에는 영향이 없다** — 대본은
 * 부가 화면이라 실패해도 컨트롤은 그대로 동작한다.
 */
export default function PlayerScriptStatus({ isError, onRetry }: PlayerScriptStatusProps) {
  return (
    <View style={styles.placeholder} accessibilityLiveRegion="polite">
      {isError ? (
        <>
          <Text style={styles.text}>{PLAYER_COPY.scriptSheet.loadFailed}</Text>
          <Pressable
            style={styles.retry}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.scriptSheet.retry}
          >
            <Text style={styles.retryLabel}>{PLAYER_COPY.scriptSheet.retry}</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator
          color={playerColor.textSecondary}
          accessibilityLabel={PLAYER_COPY.scriptSheet.loadingA11y}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
