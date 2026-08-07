import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';
import type { ResumeTarget } from '../library.types';

interface MiniPlayerBarProps {
  target: ResumeTarget;
  /** 재생 버튼 — 카드 탭과 완전히 같은 판정·팝업을 거친다(library.md 4.2) */
  onPlayPress: () => void;
  /** 본문 탭 — 전체 플레이어로 확장 */
  onExpandPress: () => void;
}

/**
 * 미니플레이어 — 앱 실행 시 일시정지 상태로 표시만 한다. 자동 재생하지 않는다.
 * 아이콘은 ▶(재생)이어야 한다 — 일시정지 아이콘은 재생 중으로 읽힌다(library-uiux.md 4.4).
 */
export default function MiniPlayerBar({ target, onPlayPress, onExpandPress }: MiniPlayerBarProps) {
  const durationSec = target.content.durationSec;
  const positionSec = target.progress?.positionSec ?? 0;
  const ratio = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
  const totalMin = Math.max(1, Math.round(durationSec / 60));
  const currentMin = Math.round(positionSec / 60);

  return (
    <View style={styles.container}>
      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityLabel={LIBRARY_COPY.miniPlayer.progressA11y(totalMin, currentMin)}
      >
        <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable
          style={styles.body}
          onPress={onExpandPress}
          accessibilityRole="button"
          accessibilityLabel={LIBRARY_COPY.miniPlayer.expandA11y(target.content.title)}
        >
          <Image source={{ uri: target.content.thumbnailUrl }} style={styles.thumbnail} />
          <Text style={styles.title} numberOfLines={1}>
            {target.content.title}
          </Text>
        </Pressable>
        <Pressable
          style={styles.playButton}
          onPress={onPlayPress}
          accessibilityRole="button"
          accessibilityLabel={LIBRARY_COPY.miniPlayer.playA11y}
        >
          <Text style={styles.playGlyph}>▶</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
    backgroundColor: theme.color.background,
  },
  progressTrack: {
    height: 2,
    backgroundColor: theme.color.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.color.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  title: {
    flex: 1,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  playButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    fontSize: theme.font.size.lg,
    color: theme.color.primary,
  },
});
