import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useAnimatedValue,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';

import PlayConfirmDialog from '../components/PlayConfirmDialog';
import PlayerMoreSheet from '../components/PlayerMoreSheet';
import PlayerRateSheet from '../components/PlayerRateSheet';
import SeekBar from '../components/SeekBar';
import { usePlayerScreen } from '../hooks/usePlayerScreen';
import {
  PLAYER_COLLAPSE_DISTANCE_RATIO,
  PLAYER_COLLAPSE_START_DISTANCE,
  PLAYER_COLLAPSE_VELOCITY,
} from '../player.constants';
import { PLAYER_COPY } from '../player.copy';

/**
 * 플레이어(PL1~PL10) — 화면은 뷰만 담당하고 로직은 usePlayerScreen이 소유한다.
 * 컨트롤 위치는 모든 상태에서 동일하다 — 손끝 위치 기억만으로 조작할 수 있어야 한다(uiux 7장).
 */
export default function PlayerScreen() {
  const screen = usePlayerScreen();
  const { session } = screen;
  const { height: windowHeight } = useWindowDimensions();
  // fullScreenModal에서는 SafeAreaView(네이티브 측정)가 상단 인셋 0을 돌려준다(검증 2026-08-11 —
  // 앱바가 상태바에 겹침). 루트 SafeAreaProvider 컨텍스트를 읽는 훅으로 직접 패딩한다
  const insets = useSafeAreaInsets();
  const containerStyle = [
    styles.container,
    { paddingTop: insets.top, paddingBottom: insets.bottom },
  ];

  /* ── 아래로 스와이프 축소(uiux 4.8) — 화면이 손가락을 따라 내려오는 것 자체가 예고다 ── */
  const translateY = useAnimatedValue(0);
  const gestureContext = useRef({ windowHeight, collapse: screen.collapse });
  useEffect(() => {
    gestureContext.current = { windowHeight, collapse: screen.collapse };
  });

  const collapsePanResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > PLAYER_COLLAPSE_START_DISTANCE &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          const { windowHeight: height, collapse } = gestureContext.current;
          const shouldCollapse =
            gesture.dy > height * PLAYER_COLLAPSE_DISTANCE_RATIO ||
            gesture.vy > PLAYER_COLLAPSE_VELOCITY;
          if (shouldCollapse) {
            collapse();
            translateY.setValue(0);
            return;
          }
          // 임계 미달 — 스프링 복귀가 "어디까지 끌면 닫히는지"를 알려준다
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [translateY],
  );

  if (!session) {
    // 세션 정리 직후(차단 전환·회수 닫기)의 한 프레임 — 아무것도 그리지 않는다
    return <View style={containerStyle} />;
  }

  /* ── PL9 회수 — 오류 톤·[다시 시도] 없이 사실만 말한다(uiux 4.10) ── */
  if (session.state === 'withdrawn') {
    return (
      <View style={containerStyle}>
        <View style={styles.withdrawn} accessibilityLiveRegion="assertive">
          <Text style={styles.withdrawnTitle}>{PLAYER_COPY.withdrawn.title}</Text>
          <Pressable
            style={styles.withdrawnClose}
            onPress={screen.closeWithdrawn}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.withdrawn.close}
          >
            <Text style={styles.withdrawnCloseLabel}>{PLAYER_COPY.withdrawn.close}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isEnded = session.state === 'ended';
  const isControlDisabled = session.state === 'loading' || session.state === 'load_failed';
  const isCompleted = session.libraryItem?.status === 'completed';
  const metaLine = [session.meta.sourceName, session.meta.authorName].filter(Boolean).join(' · ');

  const playButtonA11y = isEnded
    ? PLAYER_COPY.screen.replayA11y
    : session.isPlaying
      ? PLAYER_COPY.screen.pauseA11y
      : PLAYER_COPY.screen.playA11y;

  const renderBannerArea = () => {
    // 배너는 컨트롤 아래 한 곳 — 레이아웃을 밀지 않는다(uiux 5장)
    if (session.state === 'load_failed') {
      return (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{PLAYER_COPY.loadFailed.title}</Text>
          <Text style={styles.bannerDescription}>{PLAYER_COPY.loadFailed.description}</Text>
          <Pressable
            style={styles.bannerAction}
            onPress={screen.retryLoad}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.loadFailed.retry}
          >
            <Text style={styles.bannerActionLabel}>{PLAYER_COPY.loadFailed.retry}</Text>
          </Pressable>
        </View>
      );
    }
    if (session.banner === 'network') {
      return (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text style={styles.bannerDescription}>{PLAYER_COPY.networkBanner}</Text>
        </View>
      );
    }
    if (session.banner === 'refresh_failed') {
      return (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text style={styles.bannerDescription}>{PLAYER_COPY.refreshFailedBanner.message}</Text>
          <Pressable
            style={styles.bannerAction}
            onPress={screen.retryUrlRefresh}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.refreshFailedBanner.retry}
          >
            <Text style={styles.bannerActionLabel}>{PLAYER_COPY.refreshFailedBanner.retry}</Text>
          </Pressable>
        </View>
      );
    }
    return <View style={styles.banner} />;
  };

  return (
    <View style={containerStyle}>
      <Animated.View
        style={[styles.content, { transform: [{ translateY }] }]}
        {...collapsePanResponder.panHandlers}
      >
        {/* 앱바 — 제목을 두지 않는다. 동적 텍스트 200%에서 앱바가 먼저 넘친다(uiux 4.1) */}
        <View style={styles.appBar}>
          <Pressable
            style={styles.appBarButton}
            onPress={screen.collapse}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.screen.collapseA11y}
          >
            <Text style={styles.appBarGlyph}>⌄</Text>
          </Pressable>
          <Pressable
            style={styles.appBarButton}
            onPress={screen.openMoreSheet}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.screen.moreA11y}
          >
            <Text style={styles.appBarGlyph}>⋯</Text>
          </Pressable>
        </View>

        <View style={styles.artworkArea}>
          <View style={styles.artworkFrame}>
            {session.meta.thumbnailUrl ? (
              <Image source={{ uri: session.meta.thumbnailUrl }} style={styles.artwork} />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]} />
            )}
            {isCompleted ? (
              <View
                style={styles.completedBadge}
                accessibilityLabel={PLAYER_COPY.screen.completedBadgeA11y}
              >
                <Text style={styles.completedBadgeGlyph}>✓</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.metaArea}>
          <Text style={styles.title} numberOfLines={2}>
            {session.meta.title ?? ''}
          </Text>
          {/* 저자·출처 상시 노출(FR-12) — 오디오 멘트와 별개로 화면 고지를 생략하지 않는다 */}
          <View style={styles.sourceRow}>
            {metaLine.length > 0 ? (
              <Text style={styles.sourceText} numberOfLines={1}>
                {metaLine}
              </Text>
            ) : null}
            {session.meta.sourceUrl !== null ? (
              <Pressable
                onPress={screen.openSourceLink}
                accessibilityRole="button"
                accessibilityLabel={PLAYER_COPY.screen.sourceLink}
                style={styles.sourceLinkButton}
              >
                <Text style={styles.sourceLinkLabel}>{PLAYER_COPY.screen.sourceLink}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.controlArea}>
          <SeekBar
            positionSec={session.positionSec}
            durationSec={session.durationSec}
            disabled={isControlDisabled}
            onSeekTo={screen.seekTo}
          />

          <View style={styles.controlRow}>
            <Pressable
              style={styles.stepButton}
              onPress={screen.seekBackward}
              disabled={isControlDisabled}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.seekBackA11y}
            >
              <Text style={[styles.stepGlyph, isControlDisabled && styles.glyphDisabled]}>
                ↺<Text style={styles.stepNumber}>10</Text>
              </Text>
            </Pressable>

            <Pressable
              style={styles.playButton}
              onPress={screen.handlePlayPausePress}
              disabled={isControlDisabled}
              accessibilityRole="button"
              accessibilityLabel={
                screen.showBufferingIndicator ? PLAYER_COPY.screen.bufferingA11y : playButtonA11y
              }
            >
              {screen.showBufferingIndicator ? (
                // 로딩 표시는 재생 버튼 자리에만, 2초 초과 시만(uiux 4.3)
                <ActivityIndicator color={theme.color.onPrimary} />
              ) : (
                <Text style={styles.playGlyph}>{!isEnded && session.isPlaying ? '❚❚' : '▶'}</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.stepButton}
              onPress={screen.seekForward}
              disabled={isControlDisabled}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.seekForwardA11y}
            >
              <Text style={[styles.stepGlyph, isControlDisabled && styles.glyphDisabled]}>
                ↻<Text style={styles.stepNumber}>10</Text>
              </Text>
            </Pressable>
          </View>

          {/* 보조 줄 — 배속 칩 + P1 칩(타이머·스크립트). P1 기능(FR-25)은 미구현이라 항상
              비활성이다 — 노출 결정 2026-08-11(uiux 2장 "미노출" 규칙과 충돌, 문서 개정 대기) */}
          <View style={styles.auxRow}>
            <Pressable
              style={styles.rateChip}
              onPress={screen.openRateSheet}
              disabled={isControlDisabled}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.rateChipA11y(screen.rate)}
            >
              <Text style={[styles.rateChipLabel, isControlDisabled && styles.glyphDisabled]}>
                {PLAYER_COPY.screen.rateChip(screen.rate)}
              </Text>
            </Pressable>
            <Pressable
              style={styles.rateChip}
              disabled
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.timerChipA11y}
              accessibilityState={{ disabled: true }}
            >
              <Text style={[styles.rateChipLabel, styles.glyphDisabled]}>
                {PLAYER_COPY.screen.timerChip}
              </Text>
            </Pressable>
            <Pressable
              style={styles.rateChip}
              disabled
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.scriptChipA11y}
              accessibilityState={{ disabled: true }}
            >
              <Text style={[styles.rateChipLabel, styles.glyphDisabled]}>
                {PLAYER_COPY.screen.scriptChip}
              </Text>
            </Pressable>
          </View>

          {renderBannerArea()}
        </View>
      </Animated.View>

      {/* 삭제 스낵바 — 플레이어 화면·재생은 유지된다(확정 2026-08-10) */}
      {screen.pendingDeleteItemId !== null ? (
        <View style={styles.snackbar}>
          <Text style={styles.snackbarMessage}>{PLAYER_COPY.deleteSnackbar.message}</Text>
          <Pressable
            onPress={screen.undoDelete}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.deleteSnackbar.undo}
            style={styles.snackbarAction}
          >
            <Text style={styles.snackbarActionLabel}>{PLAYER_COPY.deleteSnackbar.undo}</Text>
          </Pressable>
        </View>
      ) : null}

      <PlayerRateSheet
        isVisible={screen.isRateSheetVisible}
        currentRate={screen.rate}
        onSelect={screen.selectRate}
        onClose={screen.closeRateSheet}
      />

      <PlayerMoreSheet
        isVisible={screen.isMoreSheetVisible}
        summary={{
          title: session.meta.title,
          authorName: session.meta.authorName,
          sourceName: session.meta.sourceName,
          thumbnailUrl: session.meta.thumbnailUrl,
          durationSec: session.durationSec,
        }}
        sourceUrl={session.meta.sourceUrl}
        canDelete={session.libraryItem !== null}
        onSourceLinkPress={screen.openSourceLink}
        onDeletePress={screen.requestDelete}
        onClose={screen.closeMoreSheet}
      />

      {/* 재청취 창 밖 ▶의 확인 팝업 — 정의는 paywall 소유, 이 화면은 호스트만 맡는다 */}
      <PlayConfirmDialog
        visible={screen.playConfirm !== null}
        remaining={screen.playConfirm?.remaining ?? 0}
        onConfirm={screen.confirmPlay}
        onCancel={screen.cancelPlayConfirm}
        onSuppressToday={screen.suppressAndPlay}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  appBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appBarButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBarGlyph: {
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  artworkArea: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
  },
  artworkFrame: {
    alignSelf: 'center',
    width: '80%',
    maxWidth: 360,
  },
  artwork: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
  },
  artworkPlaceholder: {
    backgroundColor: theme.color.surface,
  },
  completedBadge: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    // 밝은 아트워크 위에서도 보이도록 배경을 깐다(마킹 배경 처리는 시안 검증 미결)
    backgroundColor: theme.color.overlay,
  },
  completedBadgeGlyph: {
    color: theme.color.onPrimary,
    fontSize: theme.font.size.sm,
    fontWeight: '700',
  },
  metaArea: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sourceText: {
    flexShrink: 1,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  sourceLinkButton: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
  },
  sourceLinkLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  controlArea: {
    paddingBottom: theme.spacing.md,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
  },
  stepButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: {
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
  },
  stepNumber: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
  },
  glyphDisabled: {
    color: theme.color.border,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.primary,
  },
  playGlyph: {
    fontSize: theme.font.size.lg,
    color: theme.color.onPrimary,
  },
  auxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.xxl,
  },
  rateChip: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
  },
  rateChipLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  banner: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  bannerTitle: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  bannerDescription: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  bannerAction: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  bannerActionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  withdrawn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  withdrawnTitle: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  withdrawnClose: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  withdrawnCloseLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.primary,
  },
  snackbar: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: theme.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  snackbarMessage: {
    fontSize: theme.font.size.sm,
    color: theme.color.onPrimary,
  },
  snackbarAction: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  snackbarActionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.primary,
  },
});
