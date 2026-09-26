import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useContext, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { traceJs } from '@/shared/monitoring/js-trace';
import {
  armPlayerZoom,
  MINI_PLAYER_ZOOM_SOURCE_ID,
  USE_NATIVE_PLAYER_ZOOM,
} from '@/shared/navigation/zoom-transition';
import { motion, theme } from '@/shared/theme';
import GlassSurface from '@/shared/ui/GlassSurface';
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
} from '../player.constants';
import { PLAYER_COPY } from '../player.copy';
import { PauseIcon, PlayIcon } from './PlayerIcons';
import { playbackService } from '../services/playback.service';
import { miniDropProgress, miniDropStyle, MINI_DROP_TRAVEL } from '../store/mini-drop-motion';
import { useMiniPlayerLayoutStore } from '../store/mini-player-layout.store';
import { useMiniPlayerResumeStore } from '../store/mini-player-resume.store';
import { usePlaybackStore } from '../store/playback.store';
import { usePlayerOpenGestureStore } from '../store/player-open-gesture.store';

/** 미니플레이어 재생 버튼 아이콘 — 전체 플레이어보다 작게 */
const MINI_PLAY_ICON_SIZE = 20;
/** 카드 모서리 — 캡슐 탭 바(높이 60 알약)와 같은 결로 크게 */
export const MINI_CARD_RADIUS = 22;
/** 썸네일 한 변·행 위아래 여백 — PlayerScreen 의 대체 치수(MINI_THUMB_SIZE·MINI_ROW_HEIGHT)와 맞아야 한다 */
export const MINI_THUMB_SIZE = 40;
const MINI_ROW_PADDING = 6;
/** 진행바 — 아래 변, 캡슐 모서리에 잘리지 않게 양옆 12 안쪽(PM 2026-09-25) */
const PROGRESS_HEIGHT = 2;
const PROGRESS_INSET = 12;
/** 시스템 액세서리(iOS 26) 안 — 컨테이너 높이는 시스템이 주므로 내용은 더 작게, 가운데 정렬(PM 2026-09-24 "아래 공백이 크고 썸네일이 큼") */
const MINI_ACCESSORY_THUMB_SIZE = 36;
const MINI_ACCESSORY_ROW_PADDING = 4;
/**
 * 미니플레이어를 **닫을 수 없다**(PM 2026-09-25 23:24). 애플 뮤직과 같다 — 재생을 끝내거나 다른 콘텐츠로 바꾸는 것만.
 * 아래로 끌기·낭독기 '재생 종료' 액션이 전부 꺼진다. 되살리려면 true(캡슐 독의 흡수 모션 코드는 그대로 있다)
 */
const MINI_PLAYER_DISMISSABLE = false;
/** 캡슐 탭 바와 미니플레이어 카드 사이(mini-player-layout.store 의 DOCK_GAP 과 같다) */
const DOCK_GAP = 8;

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
  /**
   * 'dock' — 캡슐 탭 바 독(CapsuleTabBar) 안에 흐름대로 놓인다(2026-09-23). 캡슐과 같은 유리 묶음이라 아래로 끌면
   * 물방울처럼 합쳐진다. 복원 스냅샷은 props 가 아니라 mini-player-resume.store 에서 읽는다.
   * 'floating' — 탭 밖 화면(검색)에서 바닥에 절대 배치. 종전 방식
   * 'accessory' — iOS 26 시스템 탭 바의 bottomAccessory 안(NativeMainTabs, 2026-09-24). 유리·자리·폭은 시스템이 주므로
   *   내용만 그린다. 스냅샷은 'dock' 과 같이 스토어에서 읽는다
   */
  placement?: 'dock' | 'floating' | 'accessory';
}

/**
 * 미니플레이어(PL11) — player feature 소유의 공용 컴포넌트. 활성 세션이 있으면 실시간
 * 재생 상태를, 없으면 호스트 화면이 준 복원 스냅샷을 그린다. 오른쪽→왼쪽 스와이프로
 * 종료한다 — 2026-09-23 부터는 **아래로 끌어 캡슐 탭 바에 흡수**시킨다(종전 왼쪽 스와이프 대체).
 */
export default function MiniPlayer({
  resumeFallback: resumeFallbackProp,
  onResumePlayPress: onResumePlayPressProp,
  onResumeExpandPress: onResumeExpandPressProp,
  onResumeDismiss: onResumeDismissProp,
  placement = 'floating',
}: MiniPlayerProps) {
  // 독에 있으면 라이브러리가 스토어에 올린 복원 스냅샷을 쓴다
  const resumeStore = useMiniPlayerResumeStore();
  // 독·액세서리는 호스트 화면이 스토어에 올린 복원 스냅샷을 쓴다(props 는 탭 밖 floating 전용)
  const isDocked = placement !== 'floating';
  const isAccessory = placement === 'accessory';
  const resumeFallback = isDocked ? resumeStore.fallback : resumeFallbackProp;
  const onResumePlayPress = isDocked ? (resumeStore.onPlayPress ?? undefined) : onResumePlayPressProp;
  const onResumeExpandPress = isDocked
    ? (resumeStore.onExpandPress ?? undefined)
    : onResumeExpandPressProp;
  const onResumeDismiss = isDocked ? (resumeStore.onDismiss ?? undefined) : onResumeDismissProp;
  const navigation = useNavigation();
  // 플레이어(투명 모달)가 위에 떠 있는 동안 이 화면은 포커스를 잃는다 — 그동안 제목 흐름을 0에 세워 두면
  // 플레이어가 닫혀 내려앉는 순간 정지 제목과 같은 자리라 어긋나지 않고, 돌아와서는 처음부터 흐른다
  const isFocused = useIsFocused();
  // 탭 바가 목록 위에 떠 있으므로(MainNavigator) 그 바로 위에 선다. 탭 밖(검색 화면)에서는 0
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const session = usePlaybackStore((s) => s.session);
  const isDismissed = usePlaybackStore((s) => s.isMiniPlayerDismissed);
  // 카테고리 줄(2026-09-22 PM) — 전체 플레이어 제목 아래 줄과 같은 규칙: 주제 이름 앞 두 개, 못 찾으면 자리도 없다
  const topicsQuery = useTopicsQuery();

  /*
   * 아래로 끌어 캡슐에 흡수시켜 종료(2026-09-23 PM — 종전 왼쪽 스와이프 대체). 0 제자리 → 1 캡슐 안.
   * 카드가 캡슐 쪽으로 내려가며(translateY) 납작해지고(scaleY) 살짝 좁아지며(scaleX) 사라진다(opacity)
   */
  const dropProgress = miniDropProgress;
  // 플레이어 열림·닫힘 모션의 도착 지점 — 내 화면 좌표를 올려 두고, 사라질 땐 지운다
  const rootRef = useRef<View>(null);
  /** 플레이어 열기 — 줌 전환 갈래면 이 카드(testID)를 소스 뷰로 등록한 뒤 navigate(시스템이 카드에서 부풀려 띄운다) */
  const openPlayer = (params: { contentId: string }) => {
    traceJs('mini open → arm');
    void armPlayerZoom().then(() => {
      traceJs('mini open → navigate');
      navigation.navigate('Main', { screen: 'Player', params });
    });
  };
  const expandResume = () => {
    void armPlayerZoom().then(() => onResumeExpandPress?.());
  };
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
    isLive: isLiveVisible,
    isAccessory,
    onResumeDismiss,
    expand: () => {},
  });
  useEffect(() => {
    gestureContext.current = {
      isLive: isLiveVisible,
      isAccessory,
      onResumeDismiss,
      // 본문 탭과 같은 확대 경로 — 재생 상태 그대로, 재생을 시작시키지 않는다(uiux 4.8)
      expand: () => {
        if (isLiveVisible && session !== null) {
          openPlayer({ contentId: session.contentId });
          return;
        }
        expandResume();
      },
    };
  });

  /** 이번 제스처의 종류 — 시작할 때 방향으로 정한다(아래 = 캡슐에 흡수해 종료, 위 = 끌어올려 열기) */
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
      dropProgress.setValue(0);
    };
    const settleDrop = (toValue: 0 | 1, onDone?: () => void) => {
      Animated.spring(dropProgress, {
        toValue,
        ...motion.spring.snappy,
        overshootClamping: true,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDone?.();
      });
    };

    /*
     * 한 제스처는 시작할 때 방향으로 갈린다(2026-09-18) — 아래면 캡슐에 흡수해 종료(2026-09-23), **위쪽이면 끌어올려 열기**.
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
        // 종료 — 아래로, 수직 이동이 수평보다 확실히 클 때만(탭·가로 흔들림과 충돌 방지).
        // **닫기는 없앴다**(PM 2026-09-25 23:24 "그냥 닫을 수 없게") — 애플 뮤직도 미니플레이어를 치울 수 없다.
        // 시스템 액세서리는 유리 껍데기가 합쳐지는 퇴장 모션을 줄 수 없어 내용만 사라지는 게 더 어색했다
        const isDismiss =
          MINI_PLAYER_DISMISSABLE &&
          gesture.dy > MINI_PLAYER_OPEN_START_DISTANCE &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5;
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
        // 줌 전환 갈래(iOS 26 + 모듈 빌드): 여는 모션은 시스템 것이라 손가락을 따라가지 않는다 — 위로 밀기 시작하면
        // 곧바로 연다(애플 뮤직도 스와이프 업 = 탭과 같은 확대, 13:48 PM "위로 스와이프하면 커져야")
        if (USE_NATIVE_PLAYER_ZOOM) {
          gestureContext.current.expand();
          return;
        }
        openGesture().begin();
        openGesture().update(openProgressOf(gesture.dy));
        // 탭과 같은 경로로 플레이어를 띄운다 — 재생을 시작시키지 않는다(uiux 4.8)
        gestureContext.current.expand();
      },
      onPanResponderMove: (event, gesture) => {
        if (gestureModeRef.current === 'open') {
          if (USE_NATIVE_PLAYER_ZOOM) return;
          lastMoveAtRef.current = event.nativeEvent.timestamp;
          openGesture().update(openProgressOf(gesture.dy));
          return;
        }
        // 손가락을 따라 캡슐 쪽으로 — 위로 되돌리면 0 에서 멈춘다(위쪽 열기는 별개 제스처)
        dropProgress.setValue(Math.max(0, Math.min(1, gesture.dy / MINI_DROP_TRAVEL)));
      },
      onPanResponderRelease: (event, gesture) => {
        if (gestureModeRef.current === 'open') {
          if (USE_NATIVE_PLAYER_ZOOM) return;
          // 튕김은 "움직이던 중에 놓았을 때"만 친다 — 끌어올린 뒤 멈췄다 놓으면 속도 값은 남아 있어도 튕김이 아니다
          const isFlick =
            event.nativeEvent.timestamp - lastMoveAtRef.current <
              MINI_PLAYER_OPEN_FLICK_WINDOW_MS && -gesture.vy > MINI_PLAYER_OPEN_COMMIT_VELOCITY;
          const shouldOpen =
            openProgressOf(gesture.dy) > MINI_PLAYER_OPEN_COMMIT_PROGRESS || isFlick;
          openGesture().release(shouldOpen ? 'open' : 'cancel');
          return;
        }
        const progress = Math.max(0, Math.min(1, gesture.dy / MINI_DROP_TRAVEL));
        const shouldDismiss =
          progress > MINI_PLAYER_DISMISS_DISTANCE_RATIO || gesture.vy > MINI_PLAYER_DISMISS_VELOCITY;
        if (shouldDismiss) {
          if (gestureContext.current.isAccessory) {
            // 시스템 액세서리 — 제자리로 돌아간 뒤 숨기면(bottomAccessoryHidden) iOS 가 탭 바로 거둬들이는
            // 애니메이션을 그린다. 우리 흡수 모션을 겹치면 두 번 사라진다
            settleDrop(0, dismiss);
            return;
          }
          // 그 자리에서 마저 캡슐로 빨려 들어간 뒤 종료 — 완전히 사라진 뒤에 세션을 정리해야 카드가 툭 꺼지지 않는다
          settleDrop(1, dismiss);
          return;
        }
        // 임계 미달 — 스프링 복귀(저항감)가 오조작을 걸러낸다
        settleDrop(0);
      },
      onPanResponderTerminate: () => {
        if (gestureModeRef.current === 'open') {
          if (USE_NATIVE_PLAYER_ZOOM) return;
          // 플레이어는 이미 떠 있다 — 터치를 빼앗기면(모달 전환 등) 닫지 말고 끝까지 연다. 탭한 것과 같은 결과다
          openGesture().release('open');
          return;
        }
        settleDrop(0);
      },
    });
  }, [dropProgress]);

  /** 스와이프 종료의 스크린리더 대체 수단 — 커스텀 액션이 같은 동작을 한다(uiux 7장). 닫기를 없앤 뒤엔 액션도 없다 */
  const dismissForAccessibility = () => {
    if (!MINI_PLAYER_DISMISSABLE) return;
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
          openPlayer({ contentId: session.contentId });
        },
        onButtonPress: () => {
          if (session.state === 'ended') {
            // 완료 세션의 재청취는 판정·팝업 호스트인 플레이어(PL3)에서 시작한다
            openPlayer({ contentId: session.contentId });
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
        onBodyPress: expandResume,
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
  // 캡슐로 흡수되는 모양 — 내려가며 납작해지고 좁아지며 사라진다. 독의 유리 판(CapsuleTabBar)도 같은 식을 쓴다
  const dropStyle = miniDropStyle(dropProgress);

  return (
    <Animated.View
      ref={rootRef}
      testID={MINI_PLAYER_ZOOM_SOURCE_ID}
      style={[
        styles.container,
        isAccessory
          ? styles.containerAccessory
          : isDocked
            ? styles.containerDocked
            : [styles.containerFloating, { bottom: tabBarHeight + DOCK_GAP }],
        dropStyle,
      ]}
      onLayout={() => {
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
      {/* 유리 바탕 — 독에 있으면 CapsuleTabBar 의 GlassGroup 이 뒤 층에서 그린다(캡슐과 물방울 병합). 탭 밖에선 직접 */}
      {isDocked ? null : (
        <>
          <GlassSurface style={StyleSheet.absoluteFill} />
          <View style={styles.topLine} pointerEvents="none" />
        </>
      )}
      <View style={styles.row}>
        <Pressable
          style={[styles.body, isAccessory && styles.bodyAccessory]}
          onPress={view.onBodyPress}
          accessibilityRole="button"
          accessibilityLabel={PLAYER_COPY.miniPlayer.expandA11y(view.title)}
          // 스와이프 종료의 스크린리더 대체 수단 — 커스텀 액션(uiux 7장). 닫기를 없앤 뒤엔 액션도 두지 않는다
          accessibilityActions={
            MINI_PLAYER_DISMISSABLE
              ? [{ name: 'dismissPlayback', label: PLAYER_COPY.miniPlayer.dismissA11y }]
              : undefined
          }
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'dismissPlayback') dismissForAccessibility();
          }}
        >
          <View ref={thumbRef} style={[styles.thumbnail, isAccessory && styles.thumbnailAccessory]}>
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
      {/* 진행바는 **아래 변**(2026-09-25 PM) — 유리 위 림의 흰 하이라이트 밑에 검정 선을 두면 테두리가 두 겹으로 읽혔다.
          캡슐 모서리에서 잘리지 않게 양옆 12 안쪽, 끝은 둥글게. 카드 밑동이 차오르는 은유(Spotify·YouTube Music) */}
      <View
        style={[styles.progressTrack, isAccessory && styles.progressTrackAccessory]}
        accessibilityRole="progressbar"
        accessibilityLabel={PLAYER_COPY.miniPlayer.progressA11y(totalMin, currentMin)}
      >
        <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /*
   * 목록 **위에 떠 있는** 유리 카드(2026-09-22 PM — 애플 미니플레이어처럼). 목록은 이 밑으로 흐르고
   * (화면이 useBottomDockInset 만큼 바닥 여백을 준다) 지나가는 내용이 흐리게 비친다(GlassSurface —
   * iOS 26 리퀴드 글라스, 그 밑은 블러+틴트. runtime 5)
   */
  // 캡슐 탭 바 위에 떠 있는 둥근 카드(2026-09-23 PM) — 좌우 md 여백, 캡슐과 DOCK_GAP 띄움
  container: {
    position: 'absolute',
    // 캡슐 탭 바와 같은 폭으로 가운데(PM 2026-09-23)
    width: theme.dock.width,
    alignSelf: 'center',
    borderRadius: MINI_CARD_RADIUS,
    borderCurve: 'continuous',
    // 바탕은 GlassSurface(블러·글라스)가 깔고 이 뷰는 투명하다 — 색을 주면 유리가 가려진다
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  containerFloating: {
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.10)',
  },
  // 독 안에서는 흐름대로 — 캡슐 위에 DOCK_GAP 띄우고, 절대 배치가 아니라 위치 스타일을 지운다
  containerDocked: {
    position: 'relative',
    marginBottom: DOCK_GAP,
  },
  // 시스템 액세서리 안 — 자리·폭·높이·유리·모서리는 시스템이 준다. 높이를 채우고 행을 세로 가운데 둔다
  // (내용을 위에 붙이면 아래가 남는다, PM 2026-09-24). 진행바는 위 변에 붙인다
  containerAccessory: {
    position: 'relative',
    width: '100%',
    height: '100%',
    borderRadius: 0,
    justifyContent: 'center',
  },
  // 액세서리는 높이를 시스템이 주므로 아래 변에 붙인다(카드는 흐름상 마지막이라 그대로 아래다)
  progressTrackAccessory: {
    position: 'absolute',
    bottom: 0,
    left: PROGRESS_INSET,
    right: PROGRESS_INSET,
    marginHorizontal: 0,
  },
  bodyAccessory: {
    paddingVertical: MINI_ACCESSORY_ROW_PADDING,
  },
  thumbnailAccessory: {
    width: MINI_ACCESSORY_THUMB_SIZE,
    height: MINI_ACCESSORY_THUMB_SIZE,
  },
  // 유리 카드의 윤곽 — 밝은 목록 위에서 경계가 사라지지 않게
  topLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: MINI_CARD_RADIUS,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.10)',
  },
  progressTrack: {
    height: PROGRESS_HEIGHT,
    marginHorizontal: PROGRESS_INSET,
    borderRadius: PROGRESS_HEIGHT / 2,
    backgroundColor: theme.color.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: PROGRESS_HEIGHT / 2,
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
    // 위아래 6 — 8 이면 카드가 세로로 길어 보였다(PM 2026-09-23). 진행바 2 + 6 + 40 + 6 = 54
    paddingVertical: MINI_ROW_PADDING,
  },
  // 썸네일 40 — 카드 세로가 길어 보여 44 에서 줄였다(PM 2026-09-23). 모서리는 연속 곡률(애플식)
  thumbnail: {
    width: MINI_THUMB_SIZE,
    height: MINI_THUMB_SIZE,
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
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
