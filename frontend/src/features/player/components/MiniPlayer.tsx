import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';
import MarqueeText from '@/shared/ui/MarqueeText';
import RemoteImage from '@/shared/ui/RemoteImage';

import { useTopicsQuery } from '@/features/interest';

import {
  MINI_PLAYER_DISMISS_DISTANCE_RATIO,
  MINI_PLAYER_DISMISS_VELOCITY,
  MINI_PLAYER_OPEN_COMMIT_PROGRESS,
  MINI_PLAYER_OPEN_COMMIT_VELOCITY,
  MINI_PLAYER_OPEN_DRAG_RANGE_RATIO,
  MINI_PLAYER_OPEN_FLICK_WINDOW_MS,
  MINI_PLAYER_OPEN_START_DISTANCE,
  MINI_PLAYER_SWIPE_START_DISTANCE,
} from '../player.constants';
import { PLAYER_COPY } from '../player.copy';
import { PauseIcon, PlayIcon } from './PlayerIcons';
import { playbackService } from '../services/playback.service';
import { useMiniPlayerLayoutStore } from '../store/mini-player-layout.store';
import { usePlaybackStore } from '../store/playback.store';
import { usePlayerOpenGestureStore } from '../store/player-open-gesture.store';

/** 미니플레이어 재생 버튼 아이콘 — 전체 플레이어보다 작게 */
const MINI_PLAY_ICON_SIZE = 20;

/** 앱 재실행 복원 대상(library-api.md 4.3) — 노출·대상 판정은 라이브러리 소유(library.md 4.2) */
export interface MiniPlayerResumeFallback {
  contentId: string;
  title: string;
  thumbnailUrl: string;
  positionSec: number;
  durationSec: number;
  /** 카테고리 줄용 주제 id — 복원 응답엔 아직 없어(library-api.md 4.3) 생략되고, 그러면 제목만 그린다 */
  topicIds?: string[];
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
  // 플레이어(투명 모달)가 위에 떠 있는 동안 이 화면은 포커스를 잃는다 — 그동안 제목 흐름을 0에 세워 두면
  // 플레이어가 닫혀 내려앉는 순간 정지 제목과 같은 자리라 어긋나지 않고, 돌아와서는 처음부터 흐른다
  const isFocused = useIsFocused();
  const session = usePlaybackStore((s) => s.session);
  const isDismissed = usePlaybackStore((s) => s.isMiniPlayerDismissed);
  // 카테고리 줄(2026-09-22 PM) — 전체 플레이어 제목 아래 줄과 같은 규칙: 주제 이름 앞 두 개, 못 찾으면 자리도 없다
  const topicsQuery = useTopicsQuery();

  const [barWidth, setBarWidth] = useState(0);
  const translateX = useAnimatedValue(0);
  // 플레이어 열림·닫힘 모션의 도착 지점 — 내 화면 좌표를 올려 두고, 사라질 땐 지운다
  const rootRef = useRef<View>(null);
  // 썸네일·제목의 실제 자리 — 상수로 추정하면 몇 px 어긋나 착지 순간 잔상이 겹친다(2026-09-17)
  const thumbRef = useRef<View>(null);
  const titleRef = useRef<View>(null);
  const setMiniLayout = useMiniPlayerLayoutStore((s) => s.setLayout);
  useEffect(() => () => setMiniLayout(null), [setMiniLayout]);

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
    expand: () => {},
  });
  useEffect(() => {
    gestureContext.current = {
      barWidth,
      isLive: isLiveVisible,
      onResumeDismiss,
      // 본문 탭과 같은 확대 경로 — 재생 상태 그대로, 재생을 시작시키지 않는다(uiux 4.8)
      expand: () => {
        if (isLiveVisible && session !== null) {
          navigation.navigate('Main', {
            screen: 'Player',
            params: { contentId: session.contentId },
          });
          return;
        }
        onResumeExpandPress?.();
      },
    };
  });

  /** 이번 제스처의 종류 — 시작할 때 방향으로 정한다(왼쪽 = 종료, 위 = 끌어올려 열기) */
  const gestureModeRef = useRef<'dismiss' | 'open'>('dismiss');
  /** 마지막으로 손가락이 움직인 시각(터치 이벤트의 timestamp) — PanResponder 의 속도는 멈춰 있어도 지난 값이 남는다 */
  const lastMoveAtRef = useRef(0);

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

    /*
     * 한 제스처는 시작할 때 방향으로 갈린다(2026-09-18) — 왼쪽이면 종료 스와이프, **위쪽이면 끌어올려 열기**.
     * 끌어올리기는 시작하는 순간 플레이어(투명 모달)를 띄우고, 손가락의 이동을 진행도로 바꿔 통로 스토어에
     * 올린다. 플레이어가 그 진행도를 openProgress 로 받아 썸네일·제목이 손을 따라 커진다
     */
    const openGesture = usePlayerOpenGestureStore.getState;
    const openProgressOf = (dy: number) =>
      Math.max(
        0,
        Math.min(1, -dy / (Dimensions.get('window').height * MINI_PLAYER_OPEN_DRAG_RANGE_RATIO)),
      );

    // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        // 종료 — 수평 이동이 수직의 2배 이상 + 16dp를 넘어야 시작한다(세로 스크롤·탭 충돌 방지)
        const isDismiss =
          gesture.dx < -MINI_PLAYER_SWIPE_START_DISTANCE &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2;
        // 열기 — 위로, 수직 이동이 수평보다 확실히 클 때만
        const isOpen =
          gesture.dy < -MINI_PLAYER_OPEN_START_DISTANCE &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5;
        if (!isDismiss && !isOpen) return false;
        gestureModeRef.current = isDismiss ? 'dismiss' : 'open';
        return true;
      },
      onPanResponderGrant: (_, gesture) => {
        if (gestureModeRef.current !== 'open') return;
        openGesture().begin();
        openGesture().update(openProgressOf(gesture.dy));
        // 탭과 같은 경로로 플레이어를 띄운다 — 재생을 시작시키지 않는다(uiux 4.8)
        gestureContext.current.expand();
      },
      onPanResponderMove: (event, gesture) => {
        if (gestureModeRef.current === 'open') {
          lastMoveAtRef.current = event.nativeEvent.timestamp;
          openGesture().update(openProgressOf(gesture.dy));
          return;
        }
        // 반대 방향(왼→오른쪽)은 무시한다 — 다른 기능을 할당하지 않는다(uiux 4.8)
        translateX.setValue(Math.min(0, gesture.dx));
      },
      onPanResponderRelease: (event, gesture) => {
        if (gestureModeRef.current === 'open') {
          // 튕김은 "움직이던 중에 놓았을 때"만 친다 — 끌어올린 뒤 멈췄다 놓으면 속도 값은 남아 있어도 튕김이 아니다
          const isFlick =
            event.nativeEvent.timestamp - lastMoveAtRef.current <
              MINI_PLAYER_OPEN_FLICK_WINDOW_MS && -gesture.vy > MINI_PLAYER_OPEN_COMMIT_VELOCITY;
          const shouldOpen =
            openProgressOf(gesture.dy) > MINI_PLAYER_OPEN_COMMIT_PROGRESS || isFlick;
          openGesture().release(shouldOpen ? 'open' : 'cancel');
          return;
        }
        const { barWidth: width } = gestureContext.current;
        const shouldDismiss =
          (width > 0 && -gesture.dx > width * MINI_PLAYER_DISMISS_DISTANCE_RATIO) ||
          -gesture.vx > MINI_PLAYER_DISMISS_VELOCITY;
        if (shouldDismiss && width > 0) {
          Animated.timing(translateX, {
            toValue: -width,
            duration: motion.duration.fast,
            easing: motion.easing.easeOut,
            useNativeDriver: true,
          }).start(() => dismiss());
          return;
        }
        // 임계 미달 — 스프링 복귀(저항감)가 오조작을 걸러낸다
        Animated.spring(translateX, { toValue: 0, ...motion.spring.snappy, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        if (gestureModeRef.current === 'open') {
          // 플레이어는 이미 떠 있다 — 터치를 빼앗기면(모달 전환 등) 닫지 말고 끝까지 연다. 탭한 것과 같은 결과다
          openGesture().release('open');
          return;
        }
        Animated.spring(translateX, { toValue: 0, ...motion.spring.snappy, useNativeDriver: true }).start();
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

  const isVisible = isLiveVisible || isFallbackVisible;
  // 안 보이면 자리도 비운다 — 목록 바닥 여백(useMiniPlayerInset)이 남지 않게
  useEffect(() => {
    if (!isVisible) setMiniLayout(null);
  }, [isVisible, setMiniLayout]);

  if (!isVisible) return null;

  const view = isLiveVisible
    ? {
        title: session.meta.title ?? '',
        topicIds: session.meta.topicIds,
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
        topicIds: resumeFallback!.topicIds ?? [],
        thumbnailUrl: resumeFallback!.thumbnailUrl,
        positionSec: resumeFallback!.positionSec,
        durationSec: resumeFallback!.durationSec,
        // 복원은 일시정지 상태로만 뜬다 — ▶ 아이콘(일시정지 아이콘은 재생 중으로 읽힌다)
        isPlaying: false,
        onBodyPress: () => onResumeExpandPress?.(),
        onButtonPress: () => onResumePlayPress?.(),
      };

  const topicNames = view.topicIds
    .map((id) => topicsQuery.data?.items.find((topic) => topic.topicId === id)?.name)
    .filter((name): name is string => name !== undefined);
  const categoryLabel = topicNames.length > 0 ? topicNames.slice(0, 2).join(' · ') : null;
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
      ref={rootRef}
      style={[styles.container, { transform: [{ translateX }], opacity: swipeOpacity }]}
      onLayout={(event) => {
        setBarWidth(event.nativeEvent.layout.width);
        // 플레이어 열림·닫힘 모션의 도착 지점 — 화면 좌표로 올려 둔다(mini-player-layout.store)
        const thumb = thumbRef.current;
        const title = titleRef.current;
        rootRef.current?.measureInWindow((x, y, width, height) => {
          const base = { x, y, width, height };
          if (!thumb || !title) {
            setMiniLayout(base);
            return;
          }
          thumb.measureInWindow((tx, ty, tw) => {
            title.measureInWindow((lx, ly, lw, lh) => {
              setMiniLayout({
                ...base,
                thumb: { x: tx, y: ty, size: tw },
                title: { x: lx, y: ly, width: lw, height: lh },
              });
            });
          });
        });
      }}
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
          <View ref={thumbRef} style={styles.thumbnail}>
            {view.thumbnailUrl ? (
              <RemoteImage uri={view.thumbnailUrl} style={StyleSheet.absoluteFill} />
            ) : null}
          </View>
          <View style={styles.textColumn}>
            {/* 긴 제목은 전체 플레이어처럼 흘러 끝을 보여준다(2026-09-18 PM) — 측정용 래퍼가 착지 좌표를 준다.
                래퍼는 제목만 감싼다: 카테고리까지 넣으면 열림 모션의 제목 착지 높이가 두 줄이 된다 */}
            <View ref={titleRef} style={styles.titleBox}>
              <MarqueeText text={view.title} style={styles.title} isPaused={!isFocused} />
            </View>
            {categoryLabel !== null ? (
              <Text style={styles.category} numberOfLines={1}>
                {categoryLabel}
              </Text>
            ) : null}
          </View>
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
  /*
   * 목록 **위에 떠 있는** 반투명 카드(2026-09-22 PM — 애플 미니플레이어처럼). 목록은 이 밑으로 흐르고
   * (화면이 useMiniPlayerInset 만큼 바닥 여백을 준다) 지나가는 내용이 은은하게 비친다. 블러는 네이티브
   * 모듈(expo-blur)이 빌드에 없어 아직이다 — 빌드 때 이 면 뒤에 얹는다
   */
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
    backgroundColor: 'rgba(245, 245, 247, 0.9)',
    boxShadow: '0 -2px 12px rgba(0, 0, 0, 0.06)',
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
    width: 44,
    height: 44,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.background,
    overflow: 'hidden',
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  titleBox: {
    alignSelf: 'stretch',
  },
  // 제목 아래 카테고리 — 전체 플레이어와 같은 규칙, 크기만 xs 로(썸네일 44 안에 두 줄이 들어와야 카드 높이가 안 는다)
  category: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  title: {
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
