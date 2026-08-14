import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { theme } from '@/shared/theme';

import {
  MINI_PLAYER_DISMISS_DISTANCE_RATIO,
  MINI_PLAYER_DISMISS_VELOCITY,
  MINI_PLAYER_SWIPE_START_DISTANCE,
} from '../player.constants';
import { PLAYER_COPY } from '../player.copy';
import { PauseIcon, PlayIcon } from './PlayerIcons';
import { playbackService } from '../services/playback.service';
import { usePlaybackStore } from '../store/playback.store';

/** 미니플레이어 재생 버튼 아이콘 — 전체 플레이어보다 작게 */
const MINI_PLAY_ICON_SIZE = 20;

/** 앱 재실행 복원 대상(library-api.md 4.3) — 노출·대상 판정은 라이브러리 소유(library.md 4.2) */
export interface MiniPlayerResumeFallback {
  contentId: string;
  title: string;
  thumbnailUrl: string;
  positionSec: number;
  durationSec: number;
}

interface MiniPlayerProps {
  /** 활성 재생 세션이 없을 때만 쓰는 서버 복원 스냅샷 — 항상 일시정지(▶) 표시다(FR-24) */
  resumeFallback?: MiniPlayerResumeFallback | null;
  /** 복원 ▶ — 카드 탭과 완전히 같은 판정·팝업 경로를 거쳐야 한다(library.md 4.2) */
  onResumePlayPress?: () => void;
  /** 복원 본문 탭 — 재생을 시작시키지 않고 전체 플레이어로 확대만 한다 */
  onResumeExpandPress?: () => void;
  /** 복원 스냅샷의 스와이프 종료 — 이번 실행에서 치우는 조작(다음 실행 복원은 영향 없음) */
  onResumeDismiss?: () => void;
}

/**
 * 미니플레이어(PL11) — player feature 소유의 공용 컴포넌트. 활성 세션이 있으면 실시간
 * 재생 상태를, 없으면 호스트 화면이 준 복원 스냅샷을 그린다. 오른쪽→왼쪽 스와이프로
 * 종료한다(존치·방향 확정 2026-08-10). 왼쪽→오른쪽은 무시한다 — 플레이리스트가 없다.
 */
export default function MiniPlayer({
  resumeFallback,
  onResumePlayPress,
  onResumeExpandPress,
  onResumeDismiss,
}: MiniPlayerProps) {
  const navigation = useNavigation();
  const session = usePlaybackStore((s) => s.session);
  const isDismissed = usePlaybackStore((s) => s.isMiniPlayerDismissed);

  const [barWidth, setBarWidth] = useState(0);
  const translateX = useAnimatedValue(0);

  const isLiveVisible =
    session !== null &&
    (session.state === 'loading' || session.state === 'ready' || session.state === 'ended');
  const isFallbackVisible =
    !isLiveVisible && !isDismissed && resumeFallback !== null && resumeFallback !== undefined;

  /* PanResponder 콜백은 생성 시점 값을 캡처한다 — 최신 상태는 ref로 읽고, 갱신은 렌더 밖에서 한다 */
  const gestureContext = useRef({
    barWidth,
    isLive: isLiveVisible,
    onResumeDismiss,
  });
  useEffect(() => {
    gestureContext.current = { barWidth, isLive: isLiveVisible, onResumeDismiss };
  });

  const swipePanResponder = useMemo(() => {
    const dismiss = () => {
      const { isLive, onResumeDismiss: dismissResume } = gestureContext.current;
      // 확인 팝업·실행 취소 스낵바를 붙이지 않는다 — 지워지는 데이터가 없다(uiux 4.8)
      if (isLive) {
        playbackService.dismiss();
      } else {
        usePlaybackStore.getState().setMiniPlayerDismissed(true);
        dismissResume?.();
      }
      translateX.setValue(0);
    };

    // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
    return PanResponder.create({
      // 수평 이동이 수직의 2배 이상 + 16dp를 넘어야 시작한다(세로 스크롤·탭 충돌 방지)
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx < -MINI_PLAYER_SWIPE_START_DISTANCE &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderMove: (_, gesture) => {
        // 반대 방향(왼→오른쪽)은 무시한다 — 다른 기능을 할당하지 않는다(uiux 4.8)
        translateX.setValue(Math.min(0, gesture.dx));
      },
      onPanResponderRelease: (_, gesture) => {
        const { barWidth: width } = gestureContext.current;
        const shouldDismiss =
          (width > 0 && -gesture.dx > width * MINI_PLAYER_DISMISS_DISTANCE_RATIO) ||
          -gesture.vx > MINI_PLAYER_DISMISS_VELOCITY;
        if (shouldDismiss && width > 0) {
          Animated.timing(translateX, {
            toValue: -width,
            duration: 160,
            useNativeDriver: true,
          }).start(() => dismiss());
          return;
        }
        // 임계 미달 — 스프링 복귀(저항감)가 오조작을 걸러낸다
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    });
  }, [translateX]);

  /** 스와이프 종료의 스크린리더 대체 수단 — 커스텀 액션이 같은 동작을 한다(uiux 7장) */
  const dismissForAccessibility = () => {
    if (gestureContext.current.isLive) {
      playbackService.dismiss();
    } else {
      usePlaybackStore.getState().setMiniPlayerDismissed(true);
      gestureContext.current.onResumeDismiss?.();
    }
  };

  if (!isLiveVisible && !isFallbackVisible) return null;

  const view = isLiveVisible
    ? {
        title: session.meta.title ?? '',
        thumbnailUrl: session.meta.thumbnailUrl,
        positionSec: session.positionSec,
        durationSec: session.durationSec,
        isPlaying: session.isPlaying,
        onBodyPress: () => {
          // 확대는 재생 상태 그대로다 — 재생을 시작시키지 않는다(uiux 4.8)
          navigation.navigate('Main', {
            screen: 'Player',
            params: { contentId: session.contentId },
          });
        },
        onButtonPress: () => {
          if (session.state === 'ended') {
            // 완료 세션의 재청취는 판정·팝업 호스트인 플레이어(PL3)에서 시작한다
            navigation.navigate('Main', {
              screen: 'Player',
              params: { contentId: session.contentId },
            });
            return;
          }
          playbackService.togglePlayPause();
        },
      }
    : {
        title: resumeFallback!.title,
        thumbnailUrl: resumeFallback!.thumbnailUrl,
        positionSec: resumeFallback!.positionSec,
        durationSec: resumeFallback!.durationSec,
        // 복원은 일시정지 상태로만 뜬다 — ▶ 아이콘(일시정지 아이콘은 재생 중으로 읽힌다)
        isPlaying: false,
        onBodyPress: () => onResumeExpandPress?.(),
        onButtonPress: () => onResumePlayPress?.(),
      };

  const ratio =
    view.durationSec > 0 ? Math.min(1, Math.max(0, view.positionSec / view.durationSec)) : 0;
  const totalMin = Math.max(1, Math.round(view.durationSec / 60));
  const currentMin = Math.round(view.positionSec / 60);
  const swipeOpacity =
    barWidth > 0
      ? translateX.interpolate({
          inputRange: [-barWidth, 0],
          outputRange: [0.2, 1],
          extrapolate: 'clamp',
        })
      : 1;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateX }], opacity: swipeOpacity }]}
      onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      {...swipePanResponder.panHandlers}
    >
      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityLabel={PLAYER_COPY.miniPlayer.progressA11y(totalMin, currentMin)}
      >
        <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable
          style={styles.body}
          onPress={view.onBodyPress}
          accessibilityRole="button"
          accessibilityLabel={PLAYER_COPY.miniPlayer.expandA11y(view.title)}
          // 스와이프 종료의 스크린리더 대체 수단 — 커스텀 액션(uiux 7장)
          accessibilityActions={[
            { name: 'dismissPlayback', label: PLAYER_COPY.miniPlayer.dismissA11y },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'dismissPlayback') dismissForAccessibility();
          }}
        >
          {view.thumbnailUrl ? (
            <Image source={{ uri: view.thumbnailUrl }} style={styles.thumbnail} />
          ) : (
            <View style={styles.thumbnail} />
          )}
          <Text style={styles.title} numberOfLines={1}>
            {view.title}
          </Text>
        </Pressable>
        <Pressable
          style={styles.playButton}
          onPress={view.onButtonPress}
          accessibilityRole="button"
          accessibilityLabel={
            view.isPlaying ? PLAYER_COPY.miniPlayer.pauseA11y : PLAYER_COPY.miniPlayer.playA11y
          }
        >
          {view.isPlaying ? (
            <PauseIcon size={MINI_PLAY_ICON_SIZE} color={theme.color.textPrimary} />
          ) : (
            <PlayIcon size={MINI_PLAY_ICON_SIZE} color={theme.color.textPrimary} />
          )}
        </Pressable>
      </View>
    </Animated.View>
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
});
