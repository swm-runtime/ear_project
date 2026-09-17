import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import MarqueeText from '@/shared/ui/MarqueeText';

import { useTopicsQuery } from '@/features/interest';

import PlayConfirmDialog from '../components/PlayConfirmDialog';
import {
  MoreIcon,
  PauseIcon,
  PlayIcon,
  ScriptIcon,
  SeekBackIcon,
  SeekForwardIcon,
  SleepTimerIcon,
} from '../components/PlayerIcons';
import PlayerMoreSheet from '../components/PlayerMoreSheet';
import PlayerQueuePanel from '../components/PlayerQueuePanel';
import PlayerRateSheet from '../components/PlayerRateSheet';
import PlayerScriptPanel from '../components/PlayerScriptPanel';
import SeekBar from '../components/SeekBar';
import { usePlayerScreen } from '../hooks/usePlayerScreen';
import type { PlayerPanelKind } from '../hooks/usePlayerScreen';
import { useQueueQuery } from '../hooks/useQueueQuery';
import { useScriptQuery } from '../hooks/useScriptQuery';
import {
  PLAYER_COLLAPSE_DISTANCE_RATIO,
  PLAYER_COLLAPSE_START_DISTANCE,
  PLAYER_COLLAPSE_VELOCITY,
} from '../player.constants';
import { PLAYER_COPY } from '../player.copy';
import { useMiniPlayerLayoutStore } from '../store/mini-player-layout.store';

/**
 * 플레이어(PL1~PL10) — 화면은 뷰만 담당하고 로직은 usePlayerScreen이 소유한다.
 * 컨트롤 위치는 모든 상태에서 동일하다 — 손끝 위치 기억만으로 조작할 수 있어야 한다(uiux 7장).
 */
export default function PlayerScreen() {
  const screen = usePlayerScreen();
  const { session } = screen;
  // 제목 아래 카테고리 — 주제 id를 관심사 feature의 주제 목록(같은 캐시)에서 이름으로 바꾼다(2026-09-16)
  const topicsQuery = useTopicsQuery();
  // 스크립트(PL6) — 데이터가 없으면 손잡이 자체를 그리지 않는다(uiux 4.6). 지금은 dev mock만 채운다
  const scriptQuery = useScriptQuery(session?.contentId ?? null, session?.durationSec ?? 0);
  const scriptSegments = scriptQuery.data ?? null;
  // 재생 목록 — 바닥 서랍이 연다(2026-09-16, 스크립트와 자리 교환). 목록 = 라이브러리 첫 페이지(브리지),
  // 열었을 때만 조회한다. 손잡이는 항상 있다 — 라이브러리는 언제나 있으므로
  const queueQuery = useQueueQuery(screen.activePanel === 'queue');
  const queueItems = queueQuery.data ?? [];
  const isPanelAvailable = (kind: PlayerPanelKind) =>
    kind === 'script' ? scriptSegments !== null : true;
  const activePanel =
    screen.activePanel !== null && isPanelAvailable(screen.activePanel) ? screen.activePanel : null;
  /*
   * 펼침·접힘은 진행값 하나(0 접힘 → 1 펼침)로 아트워크·제목·패널을 함께 움직인다 —
   * 아트워크가 왼쪽 위 썸네일로 줄어드는 게 보여야 "같은 화면이 눌린 것"으로 읽힌다(2026-09-16).
   * 높이·위치를 움직이므로 JS 드라이버다. 패널은 접힘 애니메이션이 끝난 뒤에 내린다.
   * 열린 채로 다른 패널로 바꾸면 전환 없이 내용만 바뀐다
   */
  const panelProgress = useAnimatedValue(0);
  /*
   * 재생 목록(2026-09-17 PM 확정) — 스크립트와 달리 **아래에서 올라오는 시트**다. 손잡이를 끌어올리면 시트가
   * 올라온 만큼 위의 플레이어가 세로 구조(아트워크·제목·시크바·컨트롤) 그대로 공백을 접으며 압축되고, 목록은
   * 컨트롤 **아래**에 선다(유튜브 뮤직). 값 하나(queueProgress, 0 닫힘 → 1 열림)가 시트 위치와 압축을 함께 몬다
   */
  const queueProgress = useAnimatedValue(0);
  const [mountedPanel, setMountedPanel] = useState<PlayerPanelKind | null>(null);
  const setPanel = (kind: PlayerPanelKind | null) => {
    if (kind !== null && !isPanelAvailable(kind)) return;
    if (kind !== null) screen.openPanel(kind);
    else screen.closePanel();
    Animated.timing(queueProgress, {
      toValue: kind === 'queue' ? 1 : 0,
      duration: SCRIPT_TOGGLE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    // 스크립트 패널(히어로 위) — 열 때 마운트, 닫힘 애니메이션이 끝나면 내린다. 둘은 동시에 열리지 않는다
    const isScriptOpen = kind === 'script';
    if (isScriptOpen) setMountedPanel('script');
    Animated.timing(panelProgress, {
      toValue: isScriptOpen ? 1 : 0,
      duration: SCRIPT_TOGGLE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !isScriptOpen) setMountedPanel(null);
    });
  };
  // 헤더 애니메이션의 기준 치수 — 화면 폭·컨트롤 높이는 실측한다(기기마다 다르다)
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const [controlsHeight, setControlsHeight] = useState(0);
  /** 시크바 트랙 선의 아래 변(시크바 블록 기준) — 재생 목록이 열리면 앨범 커버 하한을 정확히 여기에 맞춘다(PM 2026-09-17) */
  const [seekTrackBottom, setSeekTrackBottom] = useState(0);
  // 앱바·손잡이도 실측한다 — 상수로 두면 몇 px 어긋나 접힘 상태의 히어로가 넘치고 컨트롤이 패널을 열 때마다 튄다
  const [appBarHeight, setAppBarHeight] = useState(APP_BAR_HEIGHT);
  const [handleHeight, setHandleHeight] = useState(SCRIPT_HANDLE_HEIGHT);
  const onAppBarLayout = (event: LayoutChangeEvent) =>
    setAppBarHeight(event.nativeEvent.layout.height);
  const onHandleLayout = (event: LayoutChangeEvent) =>
    setHandleHeight(event.nativeEvent.layout.height);
  const onContentLayout = (event: LayoutChangeEvent) => {
    setContentSize({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
    setContentOrigin({ x: event.nativeEvent.layout.x, y: event.nativeEvent.layout.y });
  };
  /*
   * 히어로 실측 — 열림·닫힘 모션의 "풀 화면" 쪽 좌표. 같은 수식으로 계산해도 레이아웃 반올림·패딩으로
   * 몇 px 어긋나 교차 순간 아트워크·제목이 두 장으로 보였다(2026-09-17 PM). onLayout 값은 transform 을
   * 타지 않아 모션 중에도 정지 좌표를 준다. 부모 기준 값이라 content → hero → 요소 순으로 더한다
   */
  const [contentOrigin, setContentOrigin] = useState({ x: 0, y: 0 });
  const [heroBox, setHeroBox] = useState<{ x: number; y: number } | null>(null);
  const [heroArtBox, setHeroArtBox] = useState<LayoutBox | null>(null);
  const [titleBox, setTitleBox] = useState<LayoutBox | null>(null);
  const [compactTitleBox, setCompactTitleBox] = useState<LayoutBox | null>(null);
  const onHeroLayout = (event: LayoutChangeEvent) =>
    setHeroBox({ x: event.nativeEvent.layout.x, y: event.nativeEvent.layout.y });
  const onHeroArtLayout = (event: LayoutChangeEvent) =>
    setHeroArtBox({
      x: event.nativeEvent.layout.x,
      y: event.nativeEvent.layout.y,
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  const onTitleLayout = (event: LayoutChangeEvent) => setTitleBox(event.nativeEvent.layout);
  const onCompactTitleLayout = (event: LayoutChangeEvent) =>
    setCompactTitleBox(event.nativeEvent.layout);
  const onControlsLayout = (event: LayoutChangeEvent) =>
    setControlsHeight(event.nativeEvent.layout.height);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // fullScreenModal에서는 SafeAreaView(네이티브 측정)가 상단 인셋 0을 돌려준다(검증 2026-08-11 —
  // 앱바가 상태바에 겹침). 루트 SafeAreaProvider 컨텍스트를 읽는 훅으로 직접 패딩한다
  const insets = useSafeAreaInsets();
  const containerStyle = [
    styles.container,
    { paddingTop: insets.top, paddingBottom: insets.bottom },
  ];

  /*
   * ── 열림·닫힘 모션(2026-09-16) — 미니플레이어와 이어진다 ──
   * 플레이어는 투명 모달이라 라이브러리(와 그 위 미니플레이어)가 뒤에 그대로 있다. openProgress가
   * 0(미니플레이어 자리)→1(풀 화면)로 가는 동안, 아트워크는 미니 썸네일 자리에서 커져 올라오고
   * 제목은 썸네일 옆에서 아트워크 아래로 옮겨 간다. 나머지(컨트롤·앱바)는 뒤늦게 페이드인.
   * 닫을 땐 그대로 되감아 미니플레이어 위에 정확히 내려앉은 뒤 화면을 걷는다.
   */
  const openProgress = useAnimatedValue(0);
  const [isMorphing, setIsMorphing] = useState(true);
  const hasOpenedRef = useRef(false);
  const miniLayout = useMiniPlayerLayoutStore((s) => s.layout);
  const isMeasured = contentSize.height > 0 && controlsHeight > 0;
  // 모션 레이어의 아트워크가 뜨기 전에 출발하면 첫 프레임이 회색 빈 사각이다 — 로드(또는 짧은 대기) 뒤 출발.
  // 그때까지 화면 전체를 감춰 두면 뒤의 미니플레이어가 그대로 보여 이음새가 없다
  const [isMorphImageReady, setIsMorphImageReady] = useState(false);
  const [isShellVisible, setIsShellVisible] = useState(false);
  useEffect(() => {
    if (!isMeasured || isMorphImageReady) return;
    const timer = setTimeout(() => setIsMorphImageReady(true), MORPH_IMAGE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [isMeasured, isMorphImageReady]);
  useEffect(() => {
    // 출발·도착 좌표가 실측돼야 어긋나지 않는다 — 첫 레이아웃 뒤에 시작한다
    if (!isMeasured || !isMorphImageReady || hasOpenedRef.current) return;
    hasOpenedRef.current = true;
    setIsShellVisible(true);
    Animated.timing(openProgress, {
      toValue: 1,
      duration: PLAYER_OPEN_MS,
      // 빠르게 떠서 부드럽게 멈춘다 — iOS 시트가 올라오는 곡선
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setIsMorphing(false);
    });
  }, [isMeasured, isMorphImageReady, openProgress]);
  // 드래그로 이미 내려온 만큼은 빼고 남은 거리만큼만 시간을 쓴다 — 거의 다 끌어내린 뒤 340ms를 다 쓰면 굼뜨다
  const dragProgressRef = useRef(1);
  const dismissPlayer = () => {
    setIsMorphing(true);
    Animated.timing(openProgress, {
      toValue: 0,
      duration: Math.max(PLAYER_CLOSE_MIN_MS, PLAYER_CLOSE_MS * dragProgressRef.current),
      // 천천히 떼어져서 미니플레이어 자리에 빠르게 내려앉는다
      easing: Easing.bezier(0.4, 0, 0.6, 1),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) screen.collapse();
    });
  };
  // 드래그가 임계에 못 미쳐 놓았을 때 — 끌어내린 만큼에서 스프링으로 되돌아온다
  const restorePlayer = () => {
    dragProgressRef.current = 1;
    Animated.spring(openProgress, {
      toValue: 1,
      useNativeDriver: false,
      friction: 9,
      tension: 60,
      // 1을 넘기면 모션 레이어가 풀 화면 좌표 밖으로 튀어나온다
      overshootClamping: true,
    }).start(({ finished }) => {
      if (finished) setIsMorphing(false);
    });
  };

  /*
   * ── 아래로 스와이프 축소(uiux 4.8) — 손가락이 곧 openProgress다 ──
   * 끌어내리는 만큼 아트워크가 줄고 시트가 미니플레이어 쪽으로 오므라든다. 화면을 통째로 미는 방식은
   * 놓는 순간 원위치에서 축소 모션이 다시 시작돼 위로 튀었다(2026-09-16). 놓으면 그 자리에서 이어서
   * 내려앉거나(임계 초과) 스프링으로 되돌아온다
   */
  const gestureContext = useRef({
    windowHeight,
    begin: () => {},
    drag: (_dy: number) => {},
    dismiss: () => {},
    restore: () => {},
  });
  useEffect(() => {
    gestureContext.current = {
      windowHeight,
      begin: () => setIsMorphing(true),
      drag: (dy: number) => {
        const progress = Math.max(
          0,
          Math.min(1, 1 - Math.max(0, dy) / (windowHeight * PLAYER_DRAG_RANGE_RATIO)),
        );
        dragProgressRef.current = progress;
        openProgress.setValue(progress);
      },
      dismiss: dismissPlayer,
      restore: restorePlayer,
    };
  });

  const collapsePanResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > PLAYER_COLLAPSE_START_DISTANCE &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => gestureContext.current.begin(),
        onPanResponderMove: (_, gesture) => gestureContext.current.drag(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          const { windowHeight: height, dismiss, restore } = gestureContext.current;
          const shouldCollapse =
            gesture.dy > height * PLAYER_COLLAPSE_DISTANCE_RATIO ||
            gesture.vy > PLAYER_COLLAPSE_VELOCITY;
          if (shouldCollapse) dismiss();
          else restore();
        },
        onPanResponderTerminate: () => gestureContext.current.restore(),
      }),
    [],
  );

  // 스크립트 펼침·접힘 제스처 — 콜백은 ref로 최신을 유지하고 responder는 한 번만 만든다
  const panelGestureRef = useRef({
    openScript: () => {},
    close: () => {},
  });
  useEffect(() => {
    panelGestureRef.current = {
      openScript: () => setPanel('script'),
      close: () => setPanel(null),
    };
  });
  // 좌우 스와이프 — 아트워크(접힘)·압축 헤더(펼침)에서 왼쪽으로 밀면 펼치고 오른쪽으로 밀면 접는다.
  // 가사 페이지를 옆으로 넘기는 문법(2026-09-16). 세로 성분이 크면 축소 제스처에 양보한다
  const horizontalSwipeResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > SCRIPT_SWIPE_DISTANCE &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * SCRIPT_SWIPE_AXIS_RATIO,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < 0) panelGestureRef.current.openScript();
          else panelGestureRef.current.close();
        },
      }),
    [],
  );

  /* ── 히어로 보간값 — 실측이 끝나기 전엔 폭 기준 어림값으로 그린다(첫 프레임만) ── */
  const innerWidth = Math.max(0, contentSize.width - theme.spacing.lg * 2);
  const artAreaHeight =
    contentSize.height > 0 && controlsHeight > 0
      ? Math.max(
          HERO_MIN_ARTWORK + theme.spacing.sm,
          contentSize.height -
            appBarHeight -
            HERO_META_BLOCK_HEIGHT -
            controlsHeight -
            handleHeight,
        )
      : innerWidth + theme.spacing.sm;
  const artSizeCollapsed = Math.max(
    HERO_MIN_ARTWORK,
    Math.min(innerWidth, artAreaHeight - theme.spacing.sm),
  );
  /*
   * 재생 목록 시트가 올라왔을 때의 히어로 — 아트워크는 가운데 작게, 제목은 바로 아래. 세로 구조는 그대로다.
   * 스크립트 압축(panelProgress)과는 서로 배타라(동시에 열리지 않는다) 두 값의 변위를 그냥 더한다
   */
  const queueHeroHeight = QUEUE_BANNER_HEIGHT;
  // 제목은 사진 아래쪽 가장자리에 붙는다(유튜브 뮤직) — 메타 블록 높이만큼 위, 아래 여백 sm
  const queueMetaTop =
    QUEUE_BANNER_HEIGHT - (HERO_META_BLOCK_HEIGHT - theme.spacing.lg) - theme.spacing.sm;
  const queueShift = (from: number, to: number) => Animated.multiply(queueProgress, to - from);
  const heroBase = {
    height: panelProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [artAreaHeight + HERO_META_BLOCK_HEIGHT, HERO_COMPACT_HEIGHT],
    }),
    artSize: panelProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [artSizeCollapsed, COMPACT_ARTWORK_SIZE],
    }),
    // 접힘에서는 제목·카테고리를 시크바 바로 위에 붙이고, 아트워크는 그 위 남는 높이의 가운데에 둔다 —
    // 제목과 시크바 사이에 공백을 두면 "위는 콘텐츠, 아래는 조작"의 경계가 흐려진다(2026-09-16, 폭 342pt에서
    // 남는 세로 약 160pt를 아트워크 위아래로 나눈다)
    artTop: panelProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [
        theme.spacing.sm + (artAreaHeight - theme.spacing.sm - artSizeCollapsed) / 2,
        theme.spacing.sm,
      ],
    }),
    artLeft: panelProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [(innerWidth - artSizeCollapsed) / 2, 0],
    }),
    artRadius: panelProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [theme.radius.lg, theme.radius.md],
    }),
    metaTop: panelProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [artAreaHeight + theme.spacing.lg, HERO_COMPACT_META_TOP],
    }),
    metaLeft: panelProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, COMPACT_ARTWORK_SIZE + theme.spacing.md],
    }),
    collapsedOpacity: panelProgress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [1, 0, 0],
    }),
    expandedOpacity: panelProgress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0, 1],
    }),
    panelOffset: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
  };
  const collapsedArtTop =
    theme.spacing.sm + (artAreaHeight - theme.spacing.sm - artSizeCollapsed) / 2;
  const hero = {
    ...heroBase,
    height: Animated.add(
      heroBase.height,
      queueShift(artAreaHeight + HERO_META_BLOCK_HEIGHT, queueHeroHeight),
    ),
    artLeft: Animated.add(heroBase.artLeft, queueShift((innerWidth - artSizeCollapsed) / 2, 0)),
    metaTop: Animated.add(
      heroBase.metaTop,
      queueShift(artAreaHeight + theme.spacing.lg, queueMetaTop),
    ),
  };
  // 시트의 위쪽 끝 — 닫힘: 손잡이만 남는다 / 열림: 압축된 플레이어(앱바 + 히어로 + 컨트롤) 바로 아래
  const queueClosedTop = Math.max(0, contentSize.height - handleHeight);
  const queueOpenTop = Math.min(queueClosedTop, appBarHeight + queueHeroHeight + controlsHeight);
  const queueInverse = Animated.subtract(1, queueProgress);
  // 컨트롤 줄 위아래 여백도 재생 목록이 올라온 만큼 접는다 — 목록에 자리를 더 준다(2026-09-17 PM)
  const controlRowPadding = queueProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.spacing.lg, theme.spacing.sm],
  });
  /*
   * 아트워크의 content 좌표 — 히어로 원점(실측) + 히어로 안 좌표. 재생 목록이 열리면 (0,0)에서 화면 폭 ×
   * (앱바 + 히어로 + 시크바 트랙 아래 변) 크기로 확대된다: 아래 변이 시크바 트랙 선과 맞고 시간 라벨은 커버 밖이다
   */
  const heroX = heroBox?.x ?? theme.spacing.lg;
  const heroY = heroBox?.y ?? appBarHeight;
  const queueArtHeight = appBarHeight + queueHeroHeight + seekTrackBottom;
  const art = {
    left: Animated.add(
      Animated.add(heroBase.artLeft, heroX),
      queueShift(heroX + (innerWidth - artSizeCollapsed) / 2, 0),
    ),
    top: Animated.add(Animated.add(heroBase.artTop, heroY), queueShift(heroY + collapsedArtTop, 0)),
    width: Animated.add(heroBase.artSize, queueShift(artSizeCollapsed, contentSize.width)),
    height: Animated.add(heroBase.artSize, queueShift(artSizeCollapsed, queueArtHeight)),
    radius: Animated.add(heroBase.artRadius, queueShift(theme.radius.lg, 0)),
  };
  /** 사진 위에 얹히는 순간 색이 바뀌는 요소 — 어두운 것과 흰 것을 겹쳐 두고 진행값으로 교차한다 */
  const dualTone = (dark: ReactNode, light: ReactNode) => (
    <View>
      <Animated.View style={{ opacity: queueInverse }}>{dark}</Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.dualToneOverlay, { opacity: queueProgress }]}
      >
        {light}
      </Animated.View>
    </View>
  );
  const queueTop = queueProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [queueClosedTop, queueOpenTop],
  });

  // 재생 목록 손잡이 — 손가락이 곧 queueProgress 다. 위로 끌면 시트가 따라 올라오며 위가 압축되고, 놓으면
  // 거리(35%)·속도로 열림/닫힘을 확정한다(탭은 토글). 세로 드래그 전용이라 몇 px에 먼저 잡는다(화면 축소보다 우선)
  const queueGestureRef = useRef({
    travel: 1,
    isOpen: false,
    open: () => {},
    close: () => {},
  });
  useEffect(() => {
    queueGestureRef.current = {
      travel: Math.max(1, queueClosedTop - queueOpenTop),
      isOpen: activePanel === 'queue',
      open: () => setPanel('queue'),
      close: () => setPanel(null),
    };
  });
  const handlePanResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > SCRIPT_HANDLE_CLAIM_DISTANCE &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          const { travel, isOpen } = queueGestureRef.current;
          // 위로 끌면 dy 가 음수다 — 열림 방향이 +1 이 되도록 부호를 뒤집는다
          const next = (isOpen ? 1 : 0) - gesture.dy / travel;
          queueProgress.setValue(Math.min(1, Math.max(0, next)));
        },
        onPanResponderRelease: (_, gesture) => {
          const { travel, isOpen, open, close } = queueGestureRef.current;
          // 속도가 실렸으면 거리가 모자라도 그 방향으로 — 짧게 튕기는 조작을 받는다
          if (gesture.vy < -QUEUE_COMMIT_VELOCITY) return open();
          if (gesture.vy > QUEUE_COMMIT_VELOCITY) return close();
          const progressed = (isOpen ? 1 : 0) - gesture.dy / travel;
          if (isOpen ? progressed > 1 - QUEUE_COMMIT_RATIO : progressed > QUEUE_COMMIT_RATIO)
            open();
          else close();
        },
        onPanResponderTerminate: () => {
          const { isOpen, open, close } = queueGestureRef.current;
          if (isOpen) open();
          else close();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [queueProgress],
  );

  /* ── 모션 좌표 — 출발(미니플레이어 썸네일·제목)과 도착(풀 화면 아트워크·제목)을 window 좌표로 잇는다 ── */
  const mini = miniLayout ?? {
    // 미니플레이어가 없을 때(탐색에서 진입 등)의 대체 출발점 — 화면 아래 가운데
    x: 0,
    y: windowHeight - MINI_FALLBACK_BOTTOM,
    width: contentSize.width,
    height: MINI_ROW_HEIGHT,
  };
  // 실측값 우선 — 상수 추정은 미니플레이어가 없을 때(탐색 진입 등)의 대체다
  const miniThumbLeft = mini.thumb?.x ?? mini.x + theme.spacing.md;
  const miniThumbTop = mini.thumb?.y ?? mini.y + MINI_PROGRESS_HEIGHT + theme.spacing.sm;
  const miniThumbSize = mini.thumb?.size ?? MINI_THUMB_SIZE;
  const miniTitleLeft = mini.title?.x ?? miniThumbLeft + miniThumbSize + theme.spacing.sm;
  const miniTitleTop = mini.title?.y ?? miniThumbTop + (miniThumbSize - MINI_TITLE_LINE_HEIGHT) / 2;
  const miniTitleHeight = mini.title?.height ?? MINI_TITLE_LINE_HEIGHT;
  const miniTitleWidth =
    mini.title?.width ??
    Math.max(
      80,
      mini.width -
        (theme.spacing.md + MINI_THUMB_SIZE + theme.spacing.sm) -
        MINI_BUTTON_WIDTH -
        theme.spacing.md,
    );
  // 미니플레이어 ▶ 버튼 자리 — 시트가 자라는 첫 순간에 사라진다(교차 없이 자리만 잇는다)
  const miniButtonLeft = mini.x + mini.width - theme.spacing.md - MINI_BUTTON_WIDTH;
  const miniButtonTop =
    mini.y + MINI_PROGRESS_HEIGHT + (mini.height - MINI_PROGRESS_HEIGHT - MINI_BUTTON_WIDTH) / 2;
  // 패널이 열려 있으면 히어로가 압축돼 있다 — 모션의 "풀 화면" 쪽 좌표도 그 상태를 따라야 교차 순간 안 튄다
  const isHeroCompact = activePanel === 'script';
  const isQueueOpen = activePanel === 'queue';
  const fullArtWidth = isHeroCompact
    ? COMPACT_ARTWORK_SIZE
    : isQueueOpen
      ? contentSize.width
      : artSizeCollapsed;
  const fullArtHeight = isQueueOpen
    ? appBarHeight + QUEUE_BANNER_HEIGHT + seekTrackBottom
    : fullArtWidth;
  const fullArtLeft = isHeroCompact
    ? theme.spacing.lg
    : isQueueOpen
      ? 0
      : theme.spacing.lg + (innerWidth - fullArtWidth) / 2;
  const fullArtTop = isHeroCompact
    ? insets.top + appBarHeight + theme.spacing.sm
    : isQueueOpen
      ? insets.top
      : insets.top +
        appBarHeight +
        theme.spacing.sm +
        (artAreaHeight - theme.spacing.sm - artSizeCollapsed) / 2;
  const fullArtRadius = isHeroCompact ? theme.radius.md : theme.radius.lg;
  const fullTitleLeft = isHeroCompact
    ? theme.spacing.lg + COMPACT_ARTWORK_SIZE + theme.spacing.md
    : theme.spacing.lg;
  const fullTitleTop = isHeroCompact
    ? insets.top + appBarHeight + HERO_COMPACT_META_TOP
    : isQueueOpen
      ? insets.top + appBarHeight + queueMetaTop
      : insets.top + appBarHeight + artAreaHeight + theme.spacing.lg;
  const fullTitleWidth = isHeroCompact
    ? innerWidth - COMPACT_ARTWORK_SIZE - theme.spacing.md
    : innerWidth;
  const fullTitleFontSize = isHeroCompact ? theme.font.size.lg : theme.font.size.xl;
  const measuredTitleLayer = isHeroCompact ? compactTitleBox : titleBox;
  const fullArt = heroArtBox
    ? {
        left: contentOrigin.x + heroArtBox.x,
        top: contentOrigin.y + heroArtBox.y,
        width: heroArtBox.width,
        height: heroArtBox.height,
      }
    : { left: fullArtLeft, top: fullArtTop, width: fullArtWidth, height: fullArtHeight };
  // 제목 블록(heroMeta)의 위치는 실측하지 않는다 — 웹의 onLayout 은 크기가 바뀔 때만 다시 불려, 위치만
  // 움직이는 절대 배치 요소는 첫 값(0)에 머문다(2026-09-17 실측: 제목이 화면 위 y≈92 로 날아갔다).
  // 위치는 hero.metaTop 과 같은 수식으로 두고, 히어로 원점과 제목 줄의 크기만 실측값을 쓴다
  const metaTop = isHeroCompact
    ? HERO_COMPACT_META_TOP
    : isQueueOpen
      ? queueMetaTop
      : artAreaHeight + theme.spacing.lg;
  const metaLeft = isHeroCompact ? COMPACT_ARTWORK_SIZE + theme.spacing.md : 0;
  const fullTitle =
    heroBox && measuredTitleLayer
      ? {
          left: contentOrigin.x + heroBox.x + metaLeft + measuredTitleLayer.x,
          top: contentOrigin.y + heroBox.y + metaTop + measuredTitleLayer.y,
          width: measuredTitleLayer.width,
        }
      : { left: fullTitleLeft, top: fullTitleTop, width: fullTitleWidth };
  const morph = {
    artLeft: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [miniThumbLeft, fullArt.left],
    }),
    artTop: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [miniThumbTop, fullArt.top],
    }),
    artWidth: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [miniThumbSize, fullArt.width],
    }),
    artHeight: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [miniThumbSize, fullArt.height],
    }),
    artRadius: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [theme.radius.sm, fullArtRadius],
    }),
    titleLeft: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [miniTitleLeft, fullTitle.left],
    }),
    titleTop: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [miniTitleTop, fullTitle.top],
    }),
    titleWidth: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [miniTitleWidth, fullTitle.width],
    }),
    titleFontSize: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [theme.font.size.sm, fullTitleFontSize],
    }),
    // 줄 높이도 함께 — 실제 제목(MarqueeText)은 lineHeight 36.4 안에 세로 가운데라, 이걸 안 맞추면
    // 교차 순간 제목이 몇 px 튄다
    titleLineHeight: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [miniTitleHeight, fullTitleFontSize * 1.3],
    }),
    /*
     * 교차 페이드를 쓰지 않는다(2026-09-17 PM — "애플처럼"). 미니플레이어 쪽 끝에서 모션 레이어를 투명하게
     * 하면 뒤의 진짜 미니플레이어와 몇 px 어긋난 잔상이 겹쳐 보였다. 대신 모션 레이어는 도착까지 불투명하고,
     * 착지 좌표를 미니플레이어 실측값으로 맞춰 화면을 바꿔치는 순간이 보이지 않게 한다.
     * 풀 화면 쪽 끝(0.96~1)만 실제 히어로와 교차한다 — 같은 좌표라 겹쳐도 한 장으로 보인다
     */
    layerOpacity: openProgress.interpolate({
      inputRange: [0, 0.94, 1],
      outputRange: [1, 1, 0],
    }),
    // 히어로(큰 아트워크·제목)는 모션 레이어가 대신 그린다 — 둘이 같이 보이면 아트워크가 두 장이 된다
    heroOpacity: openProgress.interpolate({ inputRange: [0, 0.94, 1], outputRange: [0, 0, 1] }),
    // 컨트롤·시크바·앱바는 시트와 함께 아래로 내려가며 중간에 사라진다 — 카드가 통째로 접히는 느낌
    contentOpacity: openProgress.interpolate({
      inputRange: [0, 0.45, 0.8, 1],
      outputRange: [0, 0, 1, 1],
    }),
    // 마지막 8%는 제자리 — 히어로와 모션 레이어가 교차하는 동안 콘텐츠가 움직이면 같은 좌표가 아니게 된다
    contentTranslateY: openProgress.interpolate({
      inputRange: [0, 0.92, 1],
      outputRange: [mini.y, 0, 0],
    }),
    // 미니플레이어 ▶ — 시트가 자라기 시작하면 바로 사라진다(닫힐 땐 마지막 12%에서 나타난다)
    miniButtonOpacity: openProgress.interpolate({
      inputRange: [0, 0.12, 1],
      outputRange: [1, 0, 0],
    }),
    // 시트 — 미니플레이어 카드(회색, 바닥 한 줄)가 그대로 자라 풀 화면(흰색)이 된다.
    // 배경을 통째로 페이드하면 그림만 떠다니는 것처럼 보인다
    sheetTop: openProgress.interpolate({ inputRange: [0, 1], outputRange: [mini.y, 0] }),
    sheetLeft: openProgress.interpolate({ inputRange: [0, 1], outputRange: [mini.x, 0] }),
    sheetWidth: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [mini.width, windowWidth],
    }),
    sheetHeight: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [mini.height, windowHeight],
    }),
    sheetRadius: openProgress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 20, 0] }),
    sheetColor: openProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [theme.color.surface, theme.color.background],
    }),
    // 뒤의 라이브러리는 살짝 가라앉는다 — 시트가 그 위에 얹혔다는 층 감각
    dimOpacity: openProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
  };

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

  const topicNames = session.meta.topicIds
    .map((id) => topicsQuery.data?.items.find((topic) => topic.topicId === id)?.name)
    .filter((name): name is string => name !== undefined);
  // 이름을 못 찾으면(목록 미도착·모르는 id) 자리도 남기지 않는다. 최대 두 개까지만 — 그 이상은 제목을 밀어낸다
  const categoryLabel = topicNames.length > 0 ? topicNames.slice(0, 2).join(' · ') : null;

  const isEnded = session.state === 'ended';
  const isControlDisabled = session.state === 'loading' || session.state === 'load_failed';
  const isCompleted = session.libraryItem?.status === 'completed';

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
    // 배너가 없을 땐 자리를 비워 두지 않는다(2026-09-16) — 접힘·펼침 양쪽에서 똑같이 없으므로 컨트롤 위치가
    // 흔들리지 않고, 그만큼 아트워크(접힘)·스크립트(펼침)가 커진다. 배너가 뜨는 순간의 밀림은 예외 상태의 몫이다
    return null;
  };

  return (
    <View style={[containerStyle, !isShellVisible && styles.shellHidden]}>
      {/* 뒤 화면 딤 + 미니플레이어 자리에서 자라나는 시트 — 0일 때는 카드 그 자체, 1일 때 풀 화면 */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.dim, { opacity: morph.dimOpacity }]}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          styles.sheet,
          {
            top: morph.sheetTop,
            left: morph.sheetLeft,
            width: morph.sheetWidth,
            height: morph.sheetHeight,
            borderTopLeftRadius: morph.sheetRadius,
            borderTopRightRadius: morph.sheetRadius,
            backgroundColor: morph.sheetColor,
          },
        ]}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          styles.content,
          { opacity: morph.contentOpacity, transform: [{ translateY: morph.contentTranslateY }] },
        ]}
        onLayout={onContentLayout}
        {...collapsePanResponder.panHandlers}
      >
        {/*
          아트워크 — 히어로 밖, content 기준 절대 배치(2026-09-17 PM). 재생 목록이 올라오면 **이 아트워크가
          그대로 확대**돼 화면 가로를 꽉 채우고 위로는 앱바까지, 아래로는 시크바 시간 라벨 밑변까지 덮는다.
          히어로 안에 두면 overflow 에 잘려 그 밖으로 커질 수 없다. 앱바·제목·시크바보다 앞(먼저) 그려 그 밑에 깔린다
        */}
        <Animated.View
          style={[
            styles.heroArtwork,
            {
              left: art.left,
              top: art.top,
              width: art.width,
              height: art.height,
              borderRadius: art.radius,
              opacity: morph.heroOpacity,
            },
          ]}
          onLayout={onHeroArtLayout}
        >
          {session.meta.thumbnailUrl ? (
            <Image source={{ uri: session.meta.thumbnailUrl }} style={styles.artwork} />
          ) : (
            <View style={[styles.artwork, styles.artworkPlaceholder]} />
          )}
          {isCompleted ? (
            <Animated.View
              style={[styles.completedBadge, { opacity: hero.collapsedOpacity }]}
              accessibilityLabel={PLAYER_COPY.screen.completedBadgeA11y}
            >
              <Text style={styles.completedBadgeGlyph}>✓</Text>
            </Animated.View>
          ) : null}
          {/* 사진 위 글자·시크바 대비용 어두운 막 — 열린 만큼만 */}
          <Animated.View
            pointerEvents="none"
            style={[styles.queueTint, { opacity: queueProgress }]}
          />
        </Animated.View>

        {/* 앱바 — 제목을 두지 않는다. 동적 텍스트 200%에서 앱바가 먼저 넘친다(uiux 4.1) */}
        <View style={styles.appBar} onLayout={onAppBarLayout}>
          <Pressable
            style={styles.appBarButton}
            onPress={dismissPlayer}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.screen.collapseA11y}
          >
            {dualTone(
              <ChevronIcon
                direction="down"
                size={APP_BAR_ICON_SIZE}
                color={theme.color.textPrimary}
              />,
              <ChevronIcon direction="down" size={APP_BAR_ICON_SIZE} color={ON_IMAGE_COLOR} />,
            )}
          </Pressable>
          <View style={styles.appBarActions}>
            {/* 수면 타이머(P1) — 재생 조작이 아니라 세션 설정이라 앱바에 둔다(2026-09-16).
                설정되면 이 자리에 남은 시간 알약이 붙는다. TODO: P1에서 시트·남은 시간 연결 */}
            <Pressable
              style={styles.appBarButton}
              disabled
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.timerA11y}
              accessibilityState={{ disabled: true }}
            >
              {dualTone(
                <SleepTimerIcon size={APP_BAR_ICON_SIZE} color={theme.color.textPrimary} />,
                <SleepTimerIcon size={APP_BAR_ICON_SIZE} color={ON_IMAGE_COLOR} />,
              )}
            </Pressable>
            <Pressable
              style={styles.appBarButton}
              onPress={screen.openMoreSheet}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.moreA11y}
            >
              {dualTone(
                <MoreIcon size={APP_BAR_ICON_SIZE} color={theme.color.textPrimary} />,
                <MoreIcon size={APP_BAR_ICON_SIZE} color={ON_IMAGE_COLOR} />,
              )}
            </Pressable>
          </View>
        </View>

        {/*
          히어로 — 아트워크 + 제목·카테고리. 접힘(0)과 펼침(1) 사이를 panelProgress가 잇는다.
          접힘: 아트워크가 가운데 크게, 제목이 그 아래. 펼침: 56pt 썸네일 + 오른쪽 제목 한 줄 헤더.
          절대 배치로 두 배치 사이를 보간한다 — 레이아웃 전환이면 "다른 화면"으로 읽힌다.
        */}
        <Animated.View
          style={[styles.hero, { height: hero.height, opacity: morph.heroOpacity }]}
          onLayout={onHeroLayout}
          {...horizontalSwipeResponder.panHandlers}
        >
          <Animated.View style={[styles.heroMeta, { top: hero.metaTop, left: hero.metaLeft }]}>
            {/* 제목은 크기가 달라 두 겹을 교차 페이드한다 — 글자 크기 자체는 보간하지 않는다 */}
            <Animated.View
              style={{ opacity: Animated.multiply(hero.collapsedOpacity, queueInverse) }}
              onLayout={onTitleLayout}
            >
              {/* 한 줄 고정 — 넘치면 흘러서 끝까지 보여준다(2026-09-16, 두 줄 접기에서 변경) */}
              <MarqueeText text={session.meta.title ?? ''} style={styles.title} />
              {categoryLabel !== null ? (
                <Text style={styles.category} numberOfLines={1}>
                  {categoryLabel}
                </Text>
              ) : null}
            </Animated.View>
            {/* 사진 위 제목 — 열림 진행값으로 흰 글자가 나타난다(유튜브 뮤직) */}
            <Animated.View
              style={[styles.heroTitleOnImageLayer, { opacity: queueProgress }]}
              pointerEvents="none"
            >
              <MarqueeText
                text={session.meta.title ?? ''}
                style={[styles.title, styles.onImageTitle]}
              />
              {categoryLabel !== null ? (
                <Text style={[styles.category, styles.onImageCategory]} numberOfLines={1}>
                  {categoryLabel}
                </Text>
              ) : null}
            </Animated.View>
            <Animated.View
              style={[styles.heroTitleCompactLayer, { opacity: hero.expandedOpacity }]}
              pointerEvents="none"
              onLayout={onCompactTitleLayout}
            >
              <MarqueeText text={session.meta.title ?? ''} style={styles.compactTitle} />
              {categoryLabel !== null ? (
                <Text style={styles.category} numberOfLines={1}>
                  {categoryLabel}
                </Text>
              ) : null}
            </Animated.View>
            {/*
              저자·출처는 여기서 그리지 않는다(결정 2026-09-15) — 콘텐츠 상세에서만 보인다.
              FR-12의 고지는 "적합한 형태로"이며 오디오 멘트(content-pipeline.md 4.3)와
              상세 화면(content-detail.md 4.3)이 그 몫을 진다.
              [원문 보기] 칩도 뺐다(2026-09-16) — 더보기(⋯) 시트의 [원문 보기]가 유일한 진입점이다.
            */}
          </Animated.View>
        </Animated.View>

        {mountedPanel !== null ? (
          <Animated.View
            style={[
              styles.scriptPanelWrap,
              { opacity: hero.expandedOpacity, transform: [{ translateY: hero.panelOffset }] },
            ]}
          >
            {mountedPanel === 'script' && scriptSegments !== null ? (
              <PlayerScriptPanel
                segments={scriptSegments}
                positionSec={session.positionSec}
                onSeek={screen.seekTo}
                onSwipeRight={() => setPanel(null)}
              />
            ) : null}
          </Animated.View>
        ) : null}

        <View style={styles.controlArea} onLayout={onControlsLayout}>
          <View>
            <Animated.View
              style={{ opacity: queueInverse }}
              pointerEvents={isQueueOpen ? 'none' : 'auto'}
            >
              <SeekBar
                positionSec={session.positionSec}
                durationSec={session.durationSec}
                disabled={isControlDisabled}
                onSeekTo={screen.seekTo}
                onTrackBottom={setSeekTrackBottom}
              />
            </Animated.View>
            <Animated.View
              style={[StyleSheet.absoluteFill, { opacity: queueProgress }]}
              pointerEvents={isQueueOpen ? 'auto' : 'none'}
            >
              <SeekBar
                positionSec={session.positionSec}
                durationSec={session.durationSec}
                disabled={isControlDisabled}
                onSeekTo={screen.seekTo}
                tone="onImage"
              />
            </Animated.View>
          </View>

          <Animated.View style={[styles.controlRow, { paddingVertical: controlRowPadding }]}>
            {/* 배속은 컨트롤 줄 맨 왼쪽에 텍스트로만 둔다(2026-09-16 — 칩 배경 제거, 보조 줄에서 이동).
                오른쪽에 같은 폭의 빈 자리를 두어 재생 버튼이 화면 가운데를 지키게 한다 */}
            <Pressable
              style={styles.rateButton}
              onPress={screen.openRateSheet}
              disabled={isControlDisabled}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.rateChipA11y(screen.rate)}
            >
              <Text style={[styles.rateLabel, isControlDisabled && styles.glyphDisabled]}>
                {PLAYER_COPY.screen.rateChip(screen.rate)}
              </Text>
            </Pressable>

            <Pressable
              style={styles.stepButton}
              onPress={screen.seekBackward}
              disabled={isControlDisabled}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.seekBackA11y}
            >
              <SeekBackIcon
                size={SEEK_ICON_SIZE}
                color={isControlDisabled ? theme.color.border : theme.color.textSecondary}
              />
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
                (() => {
                  const Icon = !isEnded && session.isPlaying ? PauseIcon : PlayIcon;
                  return <Icon size={PLAY_ICON_SIZE} color={theme.color.onPrimary} />;
                })()
              )}
            </Pressable>

            <Pressable
              style={styles.stepButton}
              onPress={screen.seekForward}
              disabled={isControlDisabled}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.seekForwardA11y}
            >
              <SeekForwardIcon
                size={SEEK_ICON_SIZE}
                color={isControlDisabled ? theme.color.border : theme.color.textSecondary}
              />
            </Pressable>

            {/* 스크립트 열기/접기(2026-09-16, 재생 목록과 자리 교환) — 배속과 같은 폭이라 재생 버튼이
                가운데를 지킨다. 스크립트가 없으면 자리만 비워 둔다(uiux 4.6 — 진입점 미노출) */}
            {scriptSegments !== null ? (
              <Pressable
                style={styles.rateButton}
                onPress={() => setPanel(activePanel === 'script' ? null : 'script')}
                disabled={isControlDisabled}
                accessibilityRole="button"
                accessibilityLabel={
                  activePanel === 'script'
                    ? PLAYER_COPY.screen.scriptCloseA11y
                    : PLAYER_COPY.screen.scriptOpenA11y
                }
                accessibilityState={{ expanded: activePanel === 'script' }}
              >
                <ScriptIcon
                  size={SEEK_ICON_SIZE}
                  color={
                    isControlDisabled
                      ? theme.color.border
                      : activePanel === 'script'
                        ? theme.color.primary
                        : theme.color.textSecondary
                  }
                />
              </Pressable>
            ) : (
              <View
                style={styles.rateButton}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            )}
          </Animated.View>

          {renderBannerArea()}
        </View>

        {/* 손잡이 자리 — 시트가 닫혀 있을 때 손잡이가 덮는 높이만큼 비워 컨트롤 위치를 고정한다 */}
        <View style={{ height: handleHeight }} />

        {/* 재생 목록 시트 — 화면 바닥에서 올라온다(2026-09-17 PM). 닫힘엔 손잡이만 보이고, 위로 끌면 시트가
            따라 올라오며 위의 플레이어가 세로 구조 그대로 공백을 접는다. 목록은 컨트롤 아래에 선다 */}
        <Animated.View style={[styles.queueSheet, { top: queueTop }]}>
          {
            // 드래그 핸들러는 감싼 View에 — Pressable은 자기 press 응답자로 panHandlers를 덮어쓴다
            <View
              style={styles.scriptHandleWrap}
              onLayout={onHandleLayout}
              {...handlePanResponder.panHandlers}
            >
              <Pressable
                style={styles.scriptHandle}
                onPress={() => setPanel(activePanel === 'queue' ? null : 'queue')}
                accessibilityRole="button"
                accessibilityLabel={
                  activePanel === 'queue'
                    ? PLAYER_COPY.screen.queueCollapseA11y
                    : PLAYER_COPY.screen.queueHandleA11y
                }
                accessibilityState={{ expanded: activePanel === 'queue' }}
              >
                <View style={styles.scriptHandleBar} />
                <Text style={styles.scriptHandleLabel}>{PLAYER_COPY.screen.queueHandle}</Text>
              </Pressable>
            </View>
          }
          <PlayerQueuePanel
            items={queueItems}
            isLoading={queueQuery.isPending}
            isError={queueQuery.isError}
            currentContentId={session.contentId}
            showHeader={false}
            onSelect={screen.playQueueItem}
            onRetry={() => void queueQuery.refetch()}
            onSwipeRight={() => setPanel(null)}
          />
        </Animated.View>
      </Animated.View>

      {/* 모션 레이어 — 열리고 닫히는 동안만. 아트워크·제목이 미니플레이어 자리와 풀 화면 자리 사이를 난다 */}
      {isMorphing ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: morph.layerOpacity }]}
          pointerEvents="none"
        >
          <Animated.View
            style={[
              styles.morphArtwork,
              {
                left: morph.artLeft,
                top: morph.artTop,
                width: morph.artWidth,
                height: morph.artHeight,
                borderRadius: morph.artRadius,
              },
            ]}
          >
            {session.meta.thumbnailUrl ? (
              <Image
                source={{ uri: session.meta.thumbnailUrl }}
                style={styles.artwork}
                // onLoad 직후 한 프레임은 아직 그려지기 전이다 — 다음 프레임에 출발해야 첫 컷이 비지 않는다
                onLoad={() => requestAnimationFrame(() => setIsMorphImageReady(true))}
                onError={() => setIsMorphImageReady(true)}
              />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]} />
            )}
          </Animated.View>
          <Animated.View
            style={[
              styles.morphMiniButton,
              { left: miniButtonLeft, top: miniButtonTop, opacity: morph.miniButtonOpacity },
            ]}
          >
            {session.isPlaying ? (
              <PauseIcon size={MINI_PLAY_ICON_SIZE} color={theme.color.textPrimary} />
            ) : (
              <PlayIcon size={MINI_PLAY_ICON_SIZE} color={theme.color.textPrimary} />
            )}
          </Animated.View>
          <Animated.Text
            style={[
              styles.morphTitle,
              {
                left: morph.titleLeft,
                top: morph.titleTop,
                width: morph.titleWidth,
                fontSize: morph.titleFontSize,
                lineHeight: morph.titleLineHeight,
              },
            ]}
            numberOfLines={1}
          >
            {session.meta.title ?? ''}
          </Animated.Text>
        </Animated.View>
      ) : null}

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
          thumbnailUrl: session.meta.thumbnailUrl,
          durationSec: session.durationSec,
        }}
        sourceUrl={session.meta.sourceUrl}
        canDelete={session.libraryItem !== null}
        onDetailPress={screen.openDetail}
        onSourceLinkPress={screen.openSourceLink}
        onDeletePress={screen.requestDelete}
        onSharePress={screen.sharePress}
        onClose={screen.closeMoreSheet}
        onDismissed={screen.handleSheetDismiss}
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

/** 앱바(닫기·더보기) 아이콘 */
const APP_BAR_ICON_SIZE = 24;
/** 손잡이가 드래그를 먼저 잡는 최소 이동 — 화면 축소 제스처(PLAYER_COLLAPSE_START_DISTANCE)보다 작아야 한다 */
const SCRIPT_HANDLE_CLAIM_DISTANCE = 4;
/** 좌우로 이만큼 밀면 스크립트를 펼치거나(←) 접는다(→) */
const SCRIPT_SWIPE_DISTANCE = 40;
/** 가로 성분이 세로의 이 배수를 넘어야 좌우 스와이프로 본다 — 목록 스크롤·화면 축소와 겹치지 않게 */
const SCRIPT_SWIPE_AXIS_RATIO = 1.5;
/** 압축 헤더의 아트워크 한 변 */
const COMPACT_ARTWORK_SIZE = 56;
/** 펼침·접힘 전환 시간 */
const SCRIPT_TOGGLE_DURATION_MS = 320;
/**
 * 재생 목록을 끌어올렸을 때의 히어로 높이 — 앨범 사진이 화면 가로를 꽉 채우고 앱바·제목·시크바까지 그 위에
 * 얹힌다(2026-09-17 PM, 유튜브 뮤직). 사진 전체 높이 = 앱바 + 이 값 + 시크바
 */
const QUEUE_BANNER_HEIGHT = 232;
/** 사진 위 텍스트·아이콘 색 */
const ON_IMAGE_COLOR = '#FFFFFF';
/** 손잡이를 놓았을 때 열림/닫힘 확정 — 이동 비율·속도(dp/ms). 실기기 검증 대상 제안값 */
const QUEUE_COMMIT_RATIO = 0.35;
const QUEUE_COMMIT_VELOCITY = 0.5;
/** 아래로 끌기 — 화면 높이의 이 비율만큼 끌면 진행값이 0(미니플레이어)에 닿는다 */
const PLAYER_DRAG_RANGE_RATIO = 0.7;
/** 드래그 후 닫힘 모션의 하한 — 이보다 짧으면 놓는 순간 미니플레이어가 "나타난" 것처럼 보인다 */
const PLAYER_CLOSE_MIN_MS = 140;
/** 열림·닫힘 모션 길이 — 닫힘이 조금 짧다: 되돌아가는 동작은 짧아야 가볍게 느껴진다 */
const PLAYER_OPEN_MS = 420;
const PLAYER_CLOSE_MS = 340;
/** 미니플레이어 카드의 내부 치수(MiniPlayer.tsx 스타일과 같아야 한다) — 진행바 2 · 썸네일 44 · 버튼 44 */
const MINI_PROGRESS_HEIGHT = 2;
const MINI_THUMB_SIZE = 44;
const MINI_BUTTON_WIDTH = 44;
const MINI_ROW_HEIGHT = 62;
/** 미니플레이어 제목(14pt) 한 줄 높이 */
const MINI_TITLE_LINE_HEIGHT = 20;
/** onLayout 이 주는 부모 기준 사각형 */
interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** 미니플레이어 ▶ 아이콘 크기(MiniPlayer.tsx 와 같은 값) */
const MINI_PLAY_ICON_SIZE = 20;
/** 미니플레이어 좌표가 없을 때 출발점을 두는 바닥 여백 — 탭 바 위쯤 */
const MINI_FALLBACK_BOTTOM = 130;
/** 모션 레이어 아트워크 로드를 기다리는 상한 — 보통은 onLoad가 먼저 온다(캐시). 실패·지연 시 이 뒤엔 그냥 출발 */
const MORPH_IMAGE_WAIT_MS = 800;
/** 앱바 높이(터치 타깃 44) — 히어로가 쓸 수 있는 높이를 셈할 때 뺀다 */
const APP_BAR_HEIGHT = 44;
/** 접힘 상태의 제목·카테고리 블록 높이 — 위 여백 24 + 제목 줄 36.4 + 간격 4 + 카테고리 20 + 아래 여백 8 */
const HERO_META_BLOCK_HEIGHT = 92;
/** 펼침 상태의 한 줄 헤더 높이 — 위 8 + 썸네일 56 + 아래 8 */
const HERO_COMPACT_HEIGHT = 72;
/** 펼침 상태에서 제목 블록(26 + 2 + 20 ≈ 48)을 썸네일 세로 가운데에 맞추는 위치 */
const HERO_COMPACT_META_TOP = 12;
/** 아트워크가 이보다 작아지면 그림이 아니라 아이콘이다 — 짧은 화면의 하한 */
const HERO_MIN_ARTWORK = 120;
/** 바닥 손잡이 높이(터치 타깃 44 + 아래 여백 8) */
const SCRIPT_HANDLE_HEIGHT = 52;
const PLAY_ICON_SIZE = 28;
/** ±10초 아이콘 — 숫자 "10"이 아이콘 안에 박혀 있다(SeekBackIcon·SeekForwardIcon). player.constants의 이동 값과 같아야 한다 */
const SEEK_ICON_SIZE = 32;

const styles = StyleSheet.create({
  // 투명 모달 — 배경은 backdrop이 openProgress만큼 깐다
  container: {
    flex: 1,
  },
  dim: {
    backgroundColor: '#000',
  },
  // 출발 준비 전 — 뒤의 미니플레이어가 그대로 보이도록 화면을 감춘다
  shellHidden: {
    opacity: 0,
  },
  sheet: {
    position: 'absolute',
    overflow: 'hidden',
  },
  morphArtwork: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: theme.color.surface,
  },
  morphTitle: {
    position: 'absolute',
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  morphMiniButton: {
    position: 'absolute',
    width: MINI_BUTTON_WIDTH,
    height: MINI_BUTTON_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
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
  // 우측 묶음 — 타이머(P1) · 더보기
  appBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /**
   * 아트워크는 위로 붙인다. 가운데 정렬하면 세로로 긴 화면에서 위아래로 큰 공백이 생겨
   * 아트워크·제목·컨트롤이 서로 떨어진 세 덩어리로 보인다. 남는 공간은 아래 spacer가 먹는다.
   */
  /**
   * 남는 세로 공간은 아트워크가 먹는다. 따로 빈 자리(spacer)를 두면 제목과 컨트롤 사이가
   * 통째로 비어 화면이 성기게 보인다 — 정사각을 유지한 채 높이에 맞춰 커지고 줄어든다.
   */
  // 히어로 — 절대 배치된 아트워크·제목이 panelProgress로 움직인다. 높이도 보간값이다
  hero: {
    position: 'relative',
    overflow: 'hidden',
  },
  heroArtwork: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: theme.color.surface,
  },
  heroMeta: {
    position: 'absolute',
    right: 0,
    gap: theme.spacing.xs,
  },
  heroTitleCompactLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    gap: 2,
  },
  scriptPanelWrap: {
    flex: 1,
    minHeight: 0,
  },
  artwork: {
    flex: 1,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
  },
  artworkPlaceholder: {
    backgroundColor: theme.color.surface,
  },
  compactTitle: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.lg * 1.3,
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
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    // 한 줄 마퀴 — lineHeight가 곧 뷰포트 높이다(MarqueeText)
    lineHeight: theme.font.size.xl * 1.3,
  },
  // 카테고리 — 제목 바로 아래, 보조색. 링크처럼 보이면 안 되므로 칩·밑줄을 두지 않는다
  category: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },

  controlArea: {
    paddingBottom: theme.spacing.sm,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // 배속이 줄에 들어오면서 xl(32)은 양끝이 너무 벌어졌다 — md(16)로 줄임(2026-09-16)
    gap: theme.spacing.md,
  },
  stepButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphDisabled: {
    color: theme.color.border,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.primary,
  },
  // 배속 — 칩 배경 없이 텍스트만. 폭은 고정해 왼쪽 버튼과 오른쪽 빈 자리가 같은 폭을 갖게 한다
  rateButton: {
    width: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  // 스크립트 손잡이 — 화면 바닥에 붙는다. 바(pill) + 라벨이 "위로 끌어올릴 수 있다"를 말한다
  // 재생 목록 시트 — 절대 배치의 기준은 content 의 바깥 모서리(패딩 안쪽이 아니다 — 2026-09-17 웹 실측).
  // inset 0 이면 화면 폭을 꽉 채운다. 목록의 좌우 여백은 패널이 갖는다
  queueSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.background,
  },
  scriptHandleWrap: {},
  // 사진 위 글자·시크바 대비 — 재생 목록이 열린 만큼 어두워진다
  queueTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  dualToneOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitleOnImageLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    gap: theme.spacing.xs,
  },
  onImageTitle: {
    color: ON_IMAGE_COLOR,
  },
  onImageCategory: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  scriptHandle: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  scriptHandleBar: {
    width: 36,
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.border,
  },
  scriptHandleLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
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
