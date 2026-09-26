import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import {
  notePlayerMounted,
  setPlayerZoomDismissBlocked,
  USE_NATIVE_PLAYER_ZOOM,
} from '@/shared/navigation/zoom-transition';
import { motion, theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import MarqueeText from '@/shared/ui/MarqueeText';
import RemoteImage from '@/shared/ui/RemoteImage';

import { useTopicsQuery } from '@/features/interest';

import { MINI_CARD_RADIUS, MINI_THUMB_SIZE } from '../components/MiniPlayer';
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
import PlayerScriptStatus from '../components/PlayerScriptStatus';
import PlayerSleepTimerSheet from '../components/PlayerSleepTimerSheet';
import SeekBar from '../components/SeekBar';
import { usePlayerScreen } from '../hooks/usePlayerScreen';
import type { PlayerPanelKind } from '../hooks/usePlayerScreen';
import { useQueueOrder } from '../hooks/useQueueOrder';
import { useQueueQuery } from '../hooks/useQueueQuery';
import { useScriptQuery } from '../hooks/useScriptQuery';
import {
  PLAYER_COLLAPSE_DISTANCE_RATIO,
  PLAYER_COLLAPSE_START_DISTANCE,
  PLAYER_COLLAPSE_VELOCITY,
} from '../player.constants';
import { PLAYER_COPY } from '../player.copy';
import { playerColor } from '../player.theme';
import type { QueueItem } from '../player.types';
import { playbackService } from '../services/playback.service';
import {
  formatSleepTimerRemaining,
  formatSleepTimerRemainingA11y,
  type SleepTimerChoice,
} from '../services/sleep-timer';
import { sleepTimerService } from '../services/sleep-timer.service';
import { useMiniPlayerLayoutStore } from '../store/mini-player-layout.store';
import { usePlayerOpenGestureStore } from '../store/player-open-gesture.store';
import { useSleepTimerStore } from '../store/sleep-timer.store';

/**
 * 플레이어(PL1~PL10) — 화면은 뷰만 담당하고 로직은 usePlayerScreen이 소유한다.
 * 컨트롤 위치는 모든 상태에서 동일하다 — 손끝 위치 기억만으로 조작할 수 있어야 한다(uiux 7장).
 */
export default function PlayerScreen() {
  const screen = usePlayerScreen();
  const { session } = screen;
  // 제목 아래 카테고리 — 주제 id를 관심사 feature의 주제 목록(같은 캐시)에서 이름으로 바꾼다(2026-09-16)
  const topicsQuery = useTopicsQuery();
  /*
   * 대본(PL6) — 버튼을 그릴지는 발급 응답의 `has_script`가 정하고, 대본 자체는 **패널을 처음 열 때** 받는다
   * (player-api.md 4.7). 받아 보니 빈 배열이면 "없음"이다 — 버튼을 숨기고 열려 있던 패널도 접힌다.
   */
  const hasScript = session?.hasScript ?? false;
  // 대본 펼침이 끝났는가 — 문단은 그 뒤에 그린다(펼침과 문단 마운트가 같은 프레임에 겹치면 끊긴다)
  const [isScriptSettled, setIsScriptSettled] = useState(false);
  /*
   * 대본 요청도 **펼침이 끝난 뒤에** 보낸다(2026-09-22 PM). 패널을 여는 순간 보내면 응답이 보통 모션 중간에
   * 도착해 파싱·상태 갱신·패널 교체 마운트가 JS 스레드를 잡고 커버 축소 프레임이 떨어진다. 처음 여는 편에서만
   * 응답 도착이 320ms 늦어질 뿐이고, 이미 받은 편은 캐시가 그대로 나온다
   */
  const scriptQuery = useScriptQuery(
    session?.contentId ?? null,
    session?.durationSec ?? 0,
    hasScript && screen.activePanel === 'script' && isScriptSettled,
  );
  const scriptSegments = scriptQuery.data ?? null;
  const isScriptAvailable = hasScript && !(scriptSegments !== null && scriptSegments.length === 0);
  // 재생 목록 — 바닥 서랍이 연다(2026-09-16, 스크립트와 자리 교환). 목록 = 라이브러리 첫 페이지(브리지),
  // 열었을 때만 조회한다. 손잡이는 항상 있다 — 라이브러리는 언제나 있으므로
  const queueQuery = useQueueQuery(screen.activePanel === 'queue');
  // 사용자가 손잡이로 바꾼 순서를 기기에 저장해 두고 받아 온 목록 위에 입힌다(2026-09-18)
  const queueOrder = useQueueOrder(queueQuery.data ?? EMPTY_QUEUE);
  const queueItems = queueOrder.orderedItems;
  const isPanelAvailable = (kind: PlayerPanelKind) =>
    kind === 'script' ? isScriptAvailable : true;
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
  /*
   * 펼침·접힘 모션은 **상태 변경이 화면에 반영된 뒤에** 출발시킨다(2026-09-21 iOS 실기기 — 커버가 줄어드는
   * 모션이 렉 걸리듯 끊겼다). 이 모션은 높이·위치를 움직여 JS 스레드에서 도는데, 같은 핸들러에서 상태를 바꾸면
   * 플레이어 화면 전체가 다시 그려지는 수십 ms 동안 모션의 첫 프레임들이 멈췄다가 건너뛴다. 두 프레임 뒤에
   * 출발하면 그 렌더가 끝난 뒤라 첫 구간이 막히지 않는다(33ms — 손가락에는 느껴지지 않는다).
   */
  const panelMotionFrameRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (panelMotionFrameRef.current !== null) cancelAnimationFrame(panelMotionFrameRef.current);
    },
    [],
  );
  const setPanel = (kind: PlayerPanelKind | null) => {
    if (kind !== null && !isPanelAvailable(kind)) return;
    if (kind !== null) screen.openPanel(kind);
    else screen.closePanel();
    // 스크립트 패널(히어로 위) — 열 때 마운트, 닫힘 애니메이션이 끝나면 내린다. 둘은 동시에 열리지 않는다
    const isScriptOpen = kind === 'script';
    if (isScriptOpen) setMountedPanel('script');
    // 대본이 펼쳐진 채 재생 목록으로 갈 땐 대본을 **즉시** 내린다 — 대본 틀(flex 1)이 컨트롤을 바닥에 밀어 두고 있어,
    // 닫힘 애니메이션이 끝날 때까지 남겨 두면 재생 목록 시트는 올라오는데 컨트롤은 바닥에 남았다가 툭 뛴다
    // (PM 2026-09-26 16:13 "스크립트 켜진 채로 재생목록 올리면 플레이 컴포넌트가 같이 안 올라간다").
    // 재생 목록이 대본 자리를 덮으므로 대본의 페이드아웃은 보이지 않는다
    // 히어로는 스프링으로 편다(아래 startMotion) — 값을 즉시 0 으로 놓으면 큰 아트워크가 한 프레임 번쩍인다
    if (kind === 'queue' && mountedPanel === 'script') {
      setMountedPanel(null);
      setIsScriptSettled(false);
    }

    const startMotion = () => {
      panelMotionFrameRef.current = null;
      // 모션 동안 0.5초 위치 틱이 화면 전체를 다시 그리지 않게 한다(2026-09-22 PM) — 끝나면 다음 틱이 따라잡는다
      playbackService.holdPositionUpdates(SCRIPT_TOGGLE_DURATION_MS);
      // 시트와 같은 smooth 스프링(2026-09-22 PM — 전환 곡선 통일). 길이는 응답 0.45초에 감쇠까지 약 SCRIPT_TOGGLE_DURATION_MS
      Animated.spring(queueProgress, {
        toValue: kind === 'queue' ? 1 : 0,
        ...motion.spring.smooth,
        overshootClamping: true,
        useNativeDriver: false,
      }).start();
      Animated.spring(panelProgress, {
        toValue: isScriptOpen ? 1 : 0,
        ...motion.spring.smooth,
        overshootClamping: true,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) return;
        if (isScriptOpen) {
          setIsScriptSettled(true);
        } else {
          setMountedPanel(null);
          setIsScriptSettled(false);
        }
      });
    };
    // 연타 — 앞서 예약한 출발은 버리고 마지막 것만 출발시킨다
    if (panelMotionFrameRef.current !== null) cancelAnimationFrame(panelMotionFrameRef.current);
    panelMotionFrameRef.current = requestAnimationFrame(() => {
      panelMotionFrameRef.current = requestAnimationFrame(startMotion);
    });
  };
  // 헤더 애니메이션의 기준 치수 — 화면 폭·컨트롤 높이는 실측한다(기기마다 다르다)
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const [controlsHeight, setControlsHeight] = useState(0);
  // 수면 타이머(FR-25 P1) — 시간은 서비스가 세고 화면은 스토어를 구독해 그린다(화면을 닫아도 타이머는 간다)
  const sleepTimerChoice = useSleepTimerStore((s) => s.choice);
  const sleepTimerRemainingSec = useSleepTimerStore((s) => s.remainingSec);
  const selectSleepTimer = (choice: SleepTimerChoice | null) => {
    if (choice === null) sleepTimerService.clear();
    else sleepTimerService.start(choice);
    screen.closeSleepTimerSheet();
  };
  const sleepTimerPill =
    sleepTimerChoice === null
      ? null
      : sleepTimerChoice.kind === 'endOfEpisode'
        ? PLAYER_COPY.screen.timerEndOfEpisodePill
        : formatSleepTimerRemaining(sleepTimerRemainingSec ?? 0);
  const sleepTimerA11y =
    sleepTimerChoice === null
      ? PLAYER_COPY.screen.timerA11y
      : sleepTimerChoice.kind === 'endOfEpisode'
        ? PLAYER_COPY.screen.timerEndOfEpisodeA11y
        : PLAYER_COPY.screen.timerActiveA11y(
            formatSleepTimerRemainingA11y(sleepTimerRemainingSec ?? 0),
          );
  // ±10초 버튼을 누른 횟수 — 바뀔 때마다 아이콘의 원호가 한 번 돈다(SeekIcon spinKey)
  const [seekSpin, setSeekSpin] = useState({ back: 0, forward: 0 });
  /** 시크바 트랙 선의 아래 변(시크바 블록 기준) — 재생 목록이 열리면 앨범 커버 하한을 정확히 여기에 맞춘다(PM 2026-09-17) */
  const [seekTrackCenter, setSeekTrackCenter] = useState(0);
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
   * 0(미니플레이어 자리)→1(풀 화면)로 가는 동안, 아트워크는 미니 썸네일 자리에서 커져 올라온다.
   * 제목은 날지 않는다 — 미니 제목은 제자리에서 사라지고 풀 화면 제목은 컨트롤·앱바와 함께 뒤늦게 들어온다(2026-09-18).
   * 닫을 땐 그대로 되감아 미니플레이어 위에 정확히 내려앉은 뒤 화면을 걷는다.
   */
  // 줌 전환 갈래(iOS 26 + 모듈 빌드)는 열림·닫힘 모션을 시스템이 맡는다 — 화면은 처음부터 다 열린 상태(1)로 그린다
  const openProgress = useAnimatedValue(USE_NATIVE_PLAYER_ZOOM ? 1 : 0);
  const [isMorphing, setIsMorphing] = useState(!USE_NATIVE_PLAYER_ZOOM);
  /*
   * 아트워크 **재생/정지 배율**(애플 뮤직 Now Playing, 2026-09-25 PM "애플처럼 전환"). 정지하면 아트워크가 작아지고
   * 재생하면 살짝 튕기며 제자리로 커진다 — 화면 전체에서 재생 상태를 한눈에 알리는 애플의 방식. 모션(열림·닫힘) 중과
   * 재생 목록이 열려 사진이 화면을 채울 땐 1 로 고정한다 — 모션 레이어와 교차하는 순간 크기가 다르면 두 장으로 보인다
   */
  const artScale = useAnimatedValue(1);
  const isArtRelaxed = isMorphing || screen.activePanel === 'queue' || (session?.isPlaying ?? true);
  useEffect(() => {
    Animated.spring(artScale, {
      toValue: isArtRelaxed ? 1 : PAUSED_ART_SCALE,
      ...motion.spring.smooth,
      // 같은 뷰의 left·top 이 JS 드라이버라 transform 도 JS 로 — 한 노드에 두 드라이버를 섞을 수 없다
      useNativeDriver: false,
    }).start();
  }, [artScale, isArtRelaxed]);
  // 진단 — 마운트 횟수(설정 > 스택 라우트 줄). 드래그 닫기 뒤 탭 전환 때 늘면 JS 가 다시 마운트한 것
  useEffect(() => {
    notePlayerMounted();
  }, []);
  const hasOpenedRef = useRef(false);
  const miniLayout = useMiniPlayerLayoutStore((s) => s.layout);
  const isMeasured = contentSize.height > 0 && controlsHeight > 0;
  // 모션 레이어의 아트워크가 뜨기 전에 출발하면 첫 프레임이 회색 빈 사각이다 — 로드(또는 짧은 대기) 뒤 출발.
  // 그때까지 화면 전체를 감춰 두면 뒤의 미니플레이어가 그대로 보여 이음새가 없다
  const [isMorphImageReady, setIsMorphImageReady] = useState(false);
  const [isShellVisible, setIsShellVisible] = useState(USE_NATIVE_PLAYER_ZOOM);
  useEffect(() => {
    if (!isMeasured || isMorphImageReady) return;
    const timer = setTimeout(() => setIsMorphImageReady(true), MORPH_IMAGE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [isMeasured, isMorphImageReady]);
  /*
   * 열림·닫힘·되돌림은 전부 **같은 스프링**이고, 손을 뗀 속도를 이어받는다(2026-09-22 PM — "애플처럼").
   * 고정 길이의 베지어 타이밍은 어디서 놓든 같은 곡선을 그려서, 던지듯 내리면 굼뜨고 살살 놓으면 급했다.
   * 스프링은 놓는 순간의 속도에서 출발해 감쇠하므로 손의 힘이 그대로 모션이 된다. 진행값은 0·1 을 넘기면
   * 모션 레이어가 좌표 밖으로 튀어나오므로 overshoot 은 막는다(iOS 시트도 끝점에서 튀지 않는다)
   */
  const dragProgressRef = useRef(1);
  // 손을 뗀 순간의 속도(진행값/초). 드래그 핸들러가 채우고 스프링이 한 번 쓰고 비운다
  const releaseVelocityRef = useRef(0);
  const takeReleaseVelocity = () => {
    const velocity = releaseVelocityRef.current;
    releaseVelocityRef.current = 0;
    return velocity;
  };
  const runSheetSpring = (toValue: 0 | 1, onFinished: () => void) => {
    Animated.spring(openProgress, {
      toValue,
      velocity: takeReleaseVelocity(),
      useNativeDriver: false,
      ...SHEET_SPRING,
      overshootClamping: true,
    }).start(({ finished }) => {
      if (finished) onFinished();
    });
  };
  // goBack 은 한 번만 — 놓기·중단·구독이 겹쳐 두 번 부르면 닫히는 중인 모달을 또 닫으려다 RNS 가 굳는다
  const isCollapsingRef = useRef(false);
  const dismissPlayer = () => {
    // 줌 전환 갈래: 화면을 걷으면 시스템이 미니플레이어 자리로 줄이는 모션을 그린다
    if (USE_NATIVE_PLAYER_ZOOM) {
      if (isCollapsingRef.current) return;
      isCollapsingRef.current = true;
      screen.collapse();
      return;
    }
    setIsMorphing(true);
    runSheetSpring(0, () => screen.collapse());
  };
  // 드래그가 임계에 못 미쳐 놓았을 때 — 끌어내린 만큼에서 되돌아온다
  const restorePlayer = () => {
    dragProgressRef.current = 1;
    runSheetSpring(1, () => setIsMorphing(false));
  };

  /*
   * ── 아래로 스와이프 축소(uiux 4.8) — 손가락이 곧 openProgress다 ──
   * 끌어내리는 만큼 아트워크가 줄고 시트가 미니플레이어 쪽으로 오므라든다. 화면을 통째로 미는 방식은
   * 놓는 순간 원위치에서 축소 모션이 다시 시작돼 위로 튀었다(2026-09-16). 놓으면 그 자리에서 이어서
   * 내려앉거나(임계 초과) 스프링으로 되돌아온다
   */
  // 끌어내리는 전체 거리 = 시트가 풀 화면(0)에서 미니플레이어 자리(mini.y)까지 가는 거리. 이 값으로 나눠야 1:1 이다
  const dragTravel = Math.max(1, miniLayout?.y ?? windowHeight - MINI_FALLBACK_BOTTOM);
  const gestureContext = useRef({
    windowHeight,
    open: () => {},
    begin: () => {},
    drag: (_dy: number, _vy: number) => {},
    follow: (_progress: number) => {},
    dismiss: () => {},
    restore: () => {},
  });
  useEffect(() => {
    gestureContext.current = {
      windowHeight,
      /*
       * 열림의 출발 — 미니플레이어를 끌어올려 연 경우(2026-09-18)엔 통로 스토어의 단계를 읽는다.
       * - 아직 끄는 중: 스스로 달리지 않는다. 진행도를 그대로 받고, 이후는 아래 구독이 이어 간다.
       * - 준비되기 전에 이미 놓았다: 취소면 0에서 곧장 걷고(미니와 같은 모습이라 티가 안 난다),
       *   열기면 그 진행도에서 끝까지 달린다.
       * - 단계 없음(탭): 평소처럼 0에서 1까지 달린다.
       */
      open: () => {
        const openGesture = usePlayerOpenGestureStore.getState();
        if (openGesture.phase === 'cancel') {
          openGesture.reset();
          dragProgressRef.current = 0;
          dismissPlayer();
          return;
        }
        if (openGesture.phase === 'dragging') {
          dragProgressRef.current = openGesture.progress;
          openProgress.setValue(openGesture.progress);
          return;
        }
        if (openGesture.phase === 'open') {
          openProgress.setValue(openGesture.progress);
          openGesture.reset();
        }
        runSheetSpring(1, () => setIsMorphing(false));
      },
      begin: () => setIsMorphing(true),
      /*
       * 시트는 손가락과 **1:1** 로 움직인다 — 시트 위치가 mini.y·(1-진행값)이므로 진행값 = 1 - dy/mini.y.
       * 종전엔 화면 높이의 70%를 끌면 끝이라 시트가 손보다 1.17배 빨리 달아났다(2026-09-22 PM)
       */
      drag: (dy: number, vy: number) => {
        const progress = Math.max(0, Math.min(1, 1 - Math.max(0, dy) / dragTravel));
        dragProgressRef.current = progress;
        // vy 는 px/ms(아래 +) → 진행값/초(닫힘 −)
        releaseVelocityRef.current = (-vy * 1000) / dragTravel;
        openProgress.setValue(progress);
      },
      // 끌어올리는 손가락을 따른다 — 진행도가 곧 openProgress 다
      follow: (progress: number) => {
        dragProgressRef.current = progress;
        openProgress.setValue(progress);
      },
      dismiss: dismissPlayer,
      restore: restorePlayer,
    };
  });

  useEffect(() => {
    // 출발·도착 좌표가 실측돼야 어긋나지 않는다 — 첫 레이아웃 뒤에 시작한다.
    // gestureContext 갱신 effect 뒤에 선언해야 같은 커밋에서 최신 open 을 부른다
    if (!isMeasured || !isMorphImageReady || hasOpenedRef.current) return;
    hasOpenedRef.current = true;
    setIsShellVisible(true);
    // 줌 전환 갈래는 이미 1 — 열림 스프링을 달리지 않는다
    if (USE_NATIVE_PLAYER_ZOOM) return;
    gestureContext.current.open();
  }, [isMeasured, isMorphImageReady]);

  /*
   * 끌어올려 열기 — 미니플레이어가 올리는 진행도를 openProgress 로 옮긴다. 놓으면 끌어내리기와 같은 마무리를
   * 쓴다: 열기 = 그 자리에서 스프링으로 1까지(restore), 취소 = 남은 거리만큼 되감고 화면을 걷는다(dismiss).
   * 준비(실측·이미지) 전의 이벤트는 위 열림 effect 가 준비되는 순간 스토어에서 직접 읽는다
   */
  useEffect(() => {
    const unsubscribe = usePlayerOpenGestureStore.subscribe((state) => {
      if (!hasOpenedRef.current || state.phase === 'idle') return;
      if (state.phase === 'dragging') {
        gestureContext.current.follow(state.progress);
        return;
      }
      const released = state.phase;
      state.reset();
      if (released === 'open') gestureContext.current.restore();
      else gestureContext.current.dismiss();
    });
    return () => {
      unsubscribe();
      // 화면이 걷힐 때 남은 단계를 지운다 — 다음 탭 열림이 "끄는 중"으로 오인되면 안 된다
      usePlayerOpenGestureStore.getState().reset();
    };
  }, [openProgress]);

  /**
   * 지금 터치가 **세로로 스크롤되는 목록(대본·재생 목록) 위에서 시작됐는가.** 축소 제스처는 화면 전체에 걸려
   * 있어서, 목록을 아래로 스크롤하는 손가락(dy > 0)을 "플레이어를 끌어내린다"로 읽고 가로챈다 — iOS 에서
   * 대본이 내려가지 않고 플레이어가 축소됐다(2026-09-21 실기기). `onTouchStart`는 응답자 협상보다 먼저 오므로
   * 여기서 표시해 두면 축소 제스처가 그 터치를 아예 넘겨받지 않는다. 목록 밖(앱바·아트워크·컨트롤)에서
   * 끌어내리는 것은 종전과 같다.
   */
  const isTouchOnScrollAreaRef = useRef(false);
  // 줌 전환 갈래: 시스템의 드래그 닫기도 같은 규칙으로 막는다 — 재생 목록을 끌어내리면 플레이어까지 같이 줄어들었다(15:49 실기기).
  // **터치가 목록·손잡이 위에서 시작했을 때만** 막는다(동기 호출 — 시스템 제스처가 시작되기 전에 반영). 패널이 열려 있어도
  // 앱바·히어로를 끌어내리면 미니플레이어로 줄어들어야 한다(16:51 PM 스샷 — 대본 펼친 채 위쪽을 밀어도 안 줄었다)
  // 열릴 때 시스템 드래그 닫기를 허용 상태로 맞추고, 내려갈 때 풀어 둔다(직전 화면의 목록 터치 상태가 남지 않게)
  useEffect(() => {
    setPlayerZoomDismissBlocked(false);
    return () => setPlayerZoomDismissBlocked(false);
  }, []);
  const scrollAreaTouchHandlers = useMemo(
    () => ({
      onTouchStart: () => {
        isTouchOnScrollAreaRef.current = true;
        setPlayerZoomDismissBlocked(true);
      },
      onTouchEnd: () => {
        isTouchOnScrollAreaRef.current = false;
        setPlayerZoomDismissBlocked(false);
      },
      onTouchCancel: () => {
        isTouchOnScrollAreaRef.current = false;
        setPlayerZoomDismissBlocked(false);
      },
    }),
    [],
  );

  const collapsePanResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        // 줌 전환 갈래는 시스템의 인터랙티브 닫기(드래그·핀치)가 맡는다 — 우리 제스처는 안 받는다
        onMoveShouldSetPanResponder: (_, gesture) =>
          !USE_NATIVE_PLAYER_ZOOM &&
          !isTouchOnScrollAreaRef.current &&
          gesture.dy > PLAYER_COLLAPSE_START_DISTANCE &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => gestureContext.current.begin(),
        onPanResponderMove: (_, gesture) => gestureContext.current.drag(gesture.dy, gesture.vy),
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
  /*
   * 제목·카테고리는 사진 아래쪽 가장자리에 **바짝** 붙는다(유튜브 뮤직). 블록의 밑변을 히어로 밑변에 맞춘다 —
   * 그 아래 시크바 터치 영역(44pt)의 위쪽 절반(≈20px)이 이미 재생바까지의 여백이라, 여기에 여백을 더 두면
   * 카테고리와 재생바 사이가 40px 가까이 벌어진다(2026-09-18 PM 지적). 카테고리가 없으면 제목 줄만큼만 잡는다
   */
  const hasQueueCategory = (session?.meta.topicIds.length ?? 0) > 0;
  const queueMetaHeight =
    QUEUE_TITLE_LINE_HEIGHT +
    (hasQueueCategory ? theme.spacing.xs + QUEUE_CATEGORY_LINE_HEIGHT : 0);
  const queueMetaTop = QUEUE_BANNER_HEIGHT - queueMetaHeight;
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
  const queueArtHeight = appBarHeight + queueHeroHeight + seekTrackCenter;
  const art = {
    left: Animated.add(
      Animated.add(heroBase.artLeft, heroX),
      queueShift(heroX + (innerWidth - artSizeCollapsed) / 2, 0),
    ),
    // 열리면 상태바 영역(insets.top)까지 위로 덮는다 — 화면 꼭대기까지 사진이다(유튜브 뮤직)
    top: Animated.add(
      Animated.add(heroBase.artTop, heroY),
      queueShift(heroY + collapsedArtTop, -insets.top),
    ),
    width: Animated.add(heroBase.artSize, queueShift(artSizeCollapsed, contentSize.width)),
    height: Animated.add(
      heroBase.artSize,
      queueShift(artSizeCollapsed, queueArtHeight + insets.top),
    ),
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
    isScriptOpen: false,
    open: () => {},
    close: () => {},
    closeScriptForDrag: () => {},
  });
  useEffect(() => {
    queueGestureRef.current = {
      travel: Math.max(1, queueClosedTop - queueOpenTop),
      isOpen: activePanel === 'queue',
      isScriptOpen: activePanel === 'script',
      open: () => setPanel('queue'),
      close: () => setPanel(null),
      // 대본이 펼쳐진 채 손잡이를 끌 때 — 대본만 즉시 내리고 히어로를 편다. setPanel(null) 은 queueProgress 도 0 으로
      // 되돌리는 스프링을 걸어 손가락과 싸웠다(위 setPanel 의 재생 목록 갈래와 같은 이유로 즉시 내린다)
      closeScriptForDrag: () => {
        screen.closePanel();
        setMountedPanel(null);
        setIsScriptSettled(false);
        playbackService.holdPositionUpdates(SCRIPT_TOGGLE_DURATION_MS);
        Animated.spring(panelProgress, {
          toValue: 0,
          ...motion.spring.smooth,
          overshootClamping: true,
          useNativeDriver: false,
        }).start();
      },
    };
  });
  /*
   * 끌기 직후의 탭을 거른다 — 손잡이는 손가락을 따라 움직이므로 누른 자리와 뗀 자리가 같은 요소다. 웹에서는
   * 그때 click 이 발생해 Pressable 의 onPress(토글)가 끌기로 방금 연 시트를 도로 닫았다(2026-09-19).
   * 네이티브는 응답자를 빼앗긴 Pressable 이 press 를 취소해 해당 없지만 같은 규칙으로 둔다
   */
  const handleDraggedRef = useRef(false);
  const handlePanResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > SCRIPT_HANDLE_CLAIM_DISTANCE &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        /*
         * 대본이 펼쳐진 채로 손잡이를 끌면 먼저 대본을 접는다(2026-09-19 PM 지적). 탭은 setPanel 이 두 패널을
         * 함께 다뤄 배타가 지켜지지만, 끌기는 queueProgress 만 직접 움직여서 대본(히어로 압축)과 재생 목록
         * (시트 압축)이 동시에 걸려 화면이 겹쳤다. 접힘 애니메이션과 끌기가 나란히 진행된다
         */
        onPanResponderGrant: () => {
          handleDraggedRef.current = true;
          const { isScriptOpen, closeScriptForDrag } = queueGestureRef.current;
          if (isScriptOpen) closeScriptForDrag();
        },
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
    ? insets.top + appBarHeight + QUEUE_BANNER_HEIGHT + seekTrackCenter
    : fullArtWidth;
  const fullArtLeft = isHeroCompact
    ? theme.spacing.lg
    : isQueueOpen
      ? 0
      : theme.spacing.lg + (innerWidth - fullArtWidth) / 2;
  const fullArtTop = isHeroCompact
    ? insets.top + appBarHeight + theme.spacing.sm
    : isQueueOpen
      ? 0
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
  /*
   * 아트워크의 두 단계(2026-09-22 PM — "애플처럼"). 닫힐 때: 시트가 내려가는 동안(0.92→MORPH_ART_SHRINK_END)
   * 아트워크는 **풀 사이즈 그대로 시트에 실려** 컨트롤과 같은 거리(contentTranslateY)만큼 내려가고, 미니플레이어
   * 근처에 온 마지막 구간(MORPH_ART_SHRINK_END→0)에서만 썸네일 자리로 줄어든다. 종전엔 0→0.92 내내 선형으로
   * 커지며 대각선으로 날아 "그림이 따로 논다"고 보였다. 열릴 땐 같은 곡선을 거꾸로 간다
   */
  const artRideOffset = (mini.y * (MORPH_ART_ARRIVE - MORPH_ART_SHRINK_END)) / MORPH_ART_ARRIVE;
  const morph = {
    /*
     * 아트워크는 교차가 시작되기 **전에** 풀 화면 자리에 도착해 있어야 한다(2026-09-19 PM 지적). 끝(1)에서야
     * 도착하면, 모션 레이어와 실제 히어로가 바뀌는 구간(0.94~1)에 모션 아트워크가 아직 덜 커진 채로 겹쳐
     * 그림이 두 장으로 보인다. 콘텐츠가 제자리에 서는 0.92 에 맞춰 도착시키고 그 뒤로는 움직이지 않는다
     */
    artLeft: openProgress.interpolate({
      inputRange: MORPH_ART_INPUT,
      outputRange: [miniThumbLeft, fullArt.left, fullArt.left, fullArt.left],
    }),
    artTop: openProgress.interpolate({
      inputRange: MORPH_ART_INPUT,
      outputRange: [miniThumbTop, fullArt.top + artRideOffset, fullArt.top, fullArt.top],
    }),
    artWidth: openProgress.interpolate({
      inputRange: MORPH_ART_INPUT,
      outputRange: [miniThumbSize, fullArt.width, fullArt.width, fullArt.width],
    }),
    artHeight: openProgress.interpolate({
      inputRange: MORPH_ART_INPUT,
      outputRange: [miniThumbSize, fullArt.height, fullArt.height, fullArt.height],
    }),
    artRadius: openProgress.interpolate({
      inputRange: MORPH_ART_INPUT,
      outputRange: [theme.radius.sm, fullArtRadius, fullArtRadius, fullArtRadius],
    }),
    /*
     * 제목은 날지 않는다(2026-09-18 PM — 제자리 페이드). 미니 자리(썸네일 옆 14px)에서 풀 화면 자리(아트워크
     * 아래 28px)까지 대각선으로 날며 크기까지 바뀌면 커지는 아트워크와 경로가 겹치고, 손으로 끌 때 글자만 따로
     * 논다. 미니 제목은 제자리에서 초반에 사라지고(▶ 와 같은 구간), 풀 화면 제목은 컨트롤·시크바와 한 덩어리로
     * 시트를 따라 올라오며 나타난다(contentOpacity·contentTranslateY). 움직이는 건 아트워크와 시트뿐이다
     */
    miniTitleOpacity: openProgress.interpolate({
      inputRange: [0, 0.12, 1],
      outputRange: [1, 0, 0],
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
      inputRange: [0, MORPH_ART_ARRIVE, 1],
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
    // 높이는 내려가는 동안 화면 높이 그대로다 — 카드가 줄어드는 게 아니라 **미끄러져 내려간다**(아트워크가 풀 사이즈로
    // 실려 있는 동안 시트 밖으로 삐져나오지 않는다). 아트워크가 줄어드는 마지막 구간에서만 미니 높이로 접힌다
    sheetHeight: openProgress.interpolate({
      inputRange: [0, MORPH_ART_SHRINK_END, 1],
      outputRange: [mini.height, windowHeight, windowHeight],
    }),
    // 출발은 미니플레이어 카드의 모서리(22) — 0 이면 착지 순간 둥근 카드 밖으로 각진 귀가 비친다(2026-09-23)
    sheetRadius: openProgress.interpolate({
      inputRange: [0, 0.3, 1],
      outputRange: [MINI_CARD_RADIUS, 20, 0],
    }),
    /*
     * 출발은 뒤의 진짜 미니플레이어(밝은 theme.surface), 도착은 플레이어의 검정. 끝까지 고르게 섞으면 중간이
     * 탁한 회색 판으로 오래 보인다 — 미니 제목·▶ 이 사라지는 12%까지만 밝게 두고, 40%에서 이미 검정에
     * 닿게 해 회색 구간을 짧게 지난다(2026-09-18)
     */
    sheetColor: openProgress.interpolate({
      inputRange: [0, 0.12, 0.4, 1],
      outputRange: [
        theme.color.surface,
        theme.color.surface,
        playerColor.background,
        playerColor.background,
      ],
    }),
    // 흐린 커버 바탕 — 시트가 검정으로 넘어가는 구간에 함께 나타난다(그 전엔 밝은 미니플레이어 색이어야 한다)
    backdropOpacity: openProgress.interpolate({
      inputRange: [0, 0.12, 0.4, 1],
      outputRange: [0, 0, 1, 1],
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
  // 재생 목록 줄의 카테고리 — 플레이어 제목 아래 줄과 같은 규칙(주제 이름 앞 두 개). 이름을 못 찾으면 null
  const queueCategoryOf = (item: QueueItem): string | null => {
    const names = item.topicIds
      .map((id) => topicsQuery.data?.items.find((topic) => topic.topicId === id)?.name)
      .filter((name): name is string => Boolean(name));
    return names.length > 0 ? names.slice(0, 2).join(' · ') : null;
  };

  const isEnded = session.state === 'ended';
  const isControlDisabled = session.state === 'loading' || session.state === 'load_failed';

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
      {/* 플레이어는 검정 바탕이다 — 떠 있는 동안 상태바 글자를 밝게. 화면이 걷히면 앱 기본(auto)으로 돌아간다 */}
      <StatusBar style="light" />
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
      >
        {/*
          바탕 — 커버를 크게 흐려 깔고 어두운 막을 얹는다(2026-09-18 PM, 애플 뮤직 방식). 무채색 단색은 값이
          뭐든 "꺼멓게" 읽혔다. 곡의 색이 바탕에 배면 같은 어두움이라도 답답하지 않다. 시트 안에 둬서 시트가
          자라는 모양대로 잘리고, 시트 색이 검정으로 넘어가는 구간(12~40%)에 함께 나타난다. 색 추출은 네이티브
          모듈이 필요해 쓰지 않았다 — 이미지 흐림은 기본 기능이라 OTA 로 나간다
        */}
        {session.meta.thumbnailUrl ? (
          <Animated.View style={[styles.backdrop, { opacity: morph.backdropOpacity }]}>
            <Image
              source={{ uri: session.meta.thumbnailUrl }}
              style={styles.backdropImage}
              // 흐린 바탕만은 기본 Image 로 둔다(KAN-78) — expo-image 의 blurRadius 는 세기 기준이 달라
              // 맞춰 둔 톤이 바뀐다. 같은 URL 을 한 번 더 받는 비용은 작다(768px WebP)
              blurRadius={BACKDROP_BLUR_RADIUS}
              resizeMode="cover"
            />
            <View style={styles.backdropScrim} />
          </Animated.View>
        ) : null}
      </Animated.View>
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
              transform: [{ scale: artScale }],
            },
          ]}
          onLayout={onHeroArtLayout}
        >
          {session.meta.thumbnailUrl ? (
            <RemoteImage
              // 잠긴 뷰는 주소가 바뀌어도 다시 불러오지 않는다 — 콘텐츠가 바뀌면 새로 만든다
              key={session.meta.thumbnailUrl}
              uri={session.meta.thumbnailUrl}
              style={styles.artwork}
              isResized
            />
          ) : (
            <View style={[styles.artwork, styles.artworkPlaceholder]} />
          )}
          {/* 완청 표식은 얹지 않는다(player-uiux.md 4.x 개정 2026-09-22 — 라이브러리 체크 마킹 폐기와 같이. 코드는 09-26 17:07 에 뒤늦게 뺐다) */}
          {/* 사진 위 글자·시크바 대비용 어두운 막 — 열린 만큼만 */}
          <Animated.View
            pointerEvents="none"
            style={[styles.queueTint, { opacity: queueProgress }]}
          />
          {/*
            아래쪽 그라데이션 — 사진 밑변으로 갈수록 플레이어 바탕색으로 잠긴다(유튜브 뮤직, 2026-09-19 PM).
            제목·카테고리·재생바가 놓이는 띠가 어떤 사진에서도 어둡고, 사진의 밑변이 칼같이 끊기지 않고 바탕으로
            녹아든다. 끝 불투명도는 1 이 아니다 — 사진 밖 바탕이 단색이 아니라 흐린 커버라, 완전히 덮으면 밑변이
            바탕보다 어두운 띠로 남는다. 밝은 테마 시절엔 아래가 흰 바탕이라 어울리지 않아 뺐었다(#440) — 검정 플레이어에서는 맞는다
          */}
          <Animated.View
            pointerEvents="none"
            style={[styles.queueArtFade, { opacity: queueProgress }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {/* 폭은 **숫자**로 준다 — 네이티브 SVG 는 "100%" 를 퍼센트가 아니라 100 으로 받아, 실기기에서 그라데이션이
                왼쪽 100pt 에만 그려졌다(2026-09-19 아이폰 실기기). 웹은 퍼센트로 동작해 테스트에 안 잡혔다.
                재생 목록이 열리면 아트워크 폭 = 화면 폭(contentSize.width)이다 */}
            <Svg width={contentSize.width} height={QUEUE_ART_FADE_HEIGHT}>
              <Defs>
                <LinearGradient id="queueArtFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={playerColor.background} stopOpacity={0} />
                  <Stop offset="0.45" stopColor={playerColor.background} stopOpacity={0.3} />
                  <Stop offset="1" stopColor={playerColor.background} stopOpacity={0.68} />
                </LinearGradient>
              </Defs>
              <Rect
                x="0"
                y="0"
                width={contentSize.width}
                height={QUEUE_ART_FADE_HEIGHT}
                fill="url(#queueArtFade)"
              />
            </Svg>
          </Animated.View>
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
                color={playerColor.textPrimary}
              />,
              <ChevronIcon direction="down" size={APP_BAR_ICON_SIZE} color={ON_IMAGE_COLOR} />,
            )}
          </Pressable>
          <View style={styles.appBarActions}>
            {/* 수면 타이머(FR-25 P1) — 재생 조작이 아니라 세션 설정이라 앱바에 둔다(2026-09-16).
                걸려 있으면 달을 채워 그리고 왼쪽에 남은 시간 알약을 붙인다(2026-09-19) */}
            <Pressable
              style={styles.timerButton}
              onPress={screen.openSleepTimerSheet}
              accessibilityRole="button"
              accessibilityLabel={sleepTimerA11y}
            >
              {sleepTimerPill !== null ? (
                <Text style={styles.timerPill} allowFontScaling={false}>
                  {sleepTimerPill}
                </Text>
              ) : null}
              {dualTone(
                <SleepTimerIcon
                  size={APP_BAR_ICON_SIZE}
                  color={playerColor.textPrimary}
                  filled={sleepTimerChoice !== null}
                />,
                <SleepTimerIcon
                  size={APP_BAR_ICON_SIZE}
                  color={ON_IMAGE_COLOR}
                  filled={sleepTimerChoice !== null}
                />,
              )}
            </Pressable>
            <Pressable
              style={styles.appBarButton}
              onPress={screen.openMoreSheet}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.moreA11y}
            >
              {dualTone(
                <MoreIcon size={APP_BAR_ICON_SIZE} color={playerColor.textPrimary} />,
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
          {/* 대본이 펼쳐져 작아진 커버를 탭하면 대본을 접는다(PM 2026-09-26 17:00 스샷). 아트워크는 히어로 **밑**의 형제라
              그 안의 Pressable 은 터치를 못 받는다(#758 실패, 17:15) — 히어로 안 같은 자리에 탭 영역을 둔다. 평소엔 없다 */}
          {activePanel === 'script' ? (
            <Animated.View
              style={[
                styles.heroArtTapArea,
                {
                  left: heroBase.artLeft,
                  top: heroBase.artTop,
                  width: heroBase.artSize,
                  height: heroBase.artSize,
                },
              ]}
            >
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setPanel(null)}
                accessibilityRole="button"
                accessibilityLabel={PLAYER_COPY.screen.scriptCloseA11y}
              />
            </Animated.View>
          ) : null}
          <Animated.View style={[styles.heroMeta, { top: hero.metaTop, left: hero.metaLeft }]}>
            {/* 제목은 크기가 달라 두 겹을 교차 페이드한다 — 글자 크기 자체는 보간하지 않는다 */}
            <Animated.View
              style={[
                styles.heroTitleLayer,
                { opacity: Animated.multiply(hero.collapsedOpacity, queueInverse) },
              ]}
              onLayout={onTitleLayout}
            >
              {/* 한 줄 고정 — 넘치면 흘러서 끝까지 보여준다(2026-09-16, 두 줄 접기에서 변경) */}
              {/* 전환(모션 레이어) 동안은 0에 세워 둔다 — 가려진 채 흘러가 있으면 전환이 끝나는 순간 중간부터
                  나타나 정지 제목과 어긋난다. 다 올라오면 처음부터 흐른다(2026-09-18 PM) */}
              <MarqueeText
                text={session.meta.title ?? ''}
                style={styles.title}
                isPaused={isMorphing}
              />
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
                isPaused={isMorphing}
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
              <MarqueeText
                text={session.meta.title ?? ''}
                style={styles.compactTitle}
                isPaused={isMorphing}
              />
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
            {...scrollAreaTouchHandlers}
          >
            {mountedPanel !== 'script' ? null : scriptSegments !== null ? (
              <PlayerScriptPanel
                segments={scriptSegments}
                positionSec={session.positionSec}
                onSeek={screen.seekTo}
                onSwipeRight={() => setPanel(null)}
                isSettled={isScriptSettled}
              />
            ) : (
              <PlayerScriptStatus
                isError={scriptQuery.isError}
                onRetry={() => void scriptQuery.refetch()}
              />
            )}
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
                onTrackCenter={setSeekTrackCenter}
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
              onPress={() => {
                setSeekSpin((prev) => ({ ...prev, back: prev.back + 1 }));
                screen.seekBackward();
              }}
              disabled={isControlDisabled}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.seekBackA11y}
            >
              <SeekBackIcon
                spinKey={seekSpin.back}
                size={SEEK_ICON_SIZE}
                color={isControlDisabled ? playerColor.border : playerColor.textSecondary}
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
                <ActivityIndicator color={playerColor.onPrimary} />
              ) : (
                (() => {
                  const Icon = !isEnded && session.isPlaying ? PauseIcon : PlayIcon;
                  return <Icon size={PLAY_ICON_SIZE} color={playerColor.onPrimary} />;
                })()
              )}
            </Pressable>

            <Pressable
              style={styles.stepButton}
              onPress={() => {
                setSeekSpin((prev) => ({ ...prev, forward: prev.forward + 1 }));
                screen.seekForward();
              }}
              disabled={isControlDisabled}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.screen.seekForwardA11y}
            >
              <SeekForwardIcon
                spinKey={seekSpin.forward}
                size={SEEK_ICON_SIZE}
                color={isControlDisabled ? playerColor.border : playerColor.textSecondary}
              />
            </Pressable>

            {/* 스크립트 열기/접기(2026-09-16, 재생 목록과 자리 교환) — 배속과 같은 폭이라 재생 버튼이
                가운데를 지킨다. 스크립트가 없으면 자리만 비워 둔다(uiux 4.6 — 진입점 미노출) */}
            {isScriptAvailable ? (
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
                      ? playerColor.border
                      : activePanel === 'script'
                        ? playerColor.primary
                        : playerColor.textSecondary
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
              // 손잡이 끌기는 재생 목록 시트의 것 — 시스템 줌 닫기가 같이 잡히지 않게 목록과 같은 표시
              {...scrollAreaTouchHandlers}
              {...handlePanResponder.panHandlers}
            >
              <Pressable
                style={styles.scriptHandle}
                onPressIn={() => {
                  handleDraggedRef.current = false;
                }}
                onPress={() => {
                  if (handleDraggedRef.current) return;
                  setPanel(activePanel === 'queue' ? null : 'queue');
                }}
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
          {/* 목록 위에서 시작한 세로 끌기는 축소 제스처가 가로채지 않는다(위 `isTouchOnScrollAreaRef`) */}
          <View style={styles.queuePanelWrap} {...scrollAreaTouchHandlers}>
            <PlayerQueuePanel
              items={queueItems}
              isLoading={queueQuery.isPending}
              isError={queueQuery.isError}
              currentContentId={session.contentId}
              showHeader={false}
              onSelect={screen.playQueueItem}
              onReorder={queueOrder.move}
              categoryOf={queueCategoryOf}
              onRetry={() => void queueQuery.refetch()}
              onSwipeRight={() => setPanel(null)}
            />
          </View>
        </Animated.View>
      </Animated.View>

      {/* 모션 레이어 — 열리고 닫히는 동안만. 아트워크가 미니플레이어 자리와 풀 화면 자리 사이를 난다(제목은 제자리 페이드) */}
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
              <RemoteImage
                key={session.meta.thumbnailUrl}
                uri={session.meta.thumbnailUrl}
                style={styles.artwork}
                isResized
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
          {/* 미니 제목 — 미니플레이어 실측 자리에 고정, 초반에 사라진다 */}
          <Animated.Text
            style={[
              styles.morphTitle,
              styles.morphMiniTitle,
              {
                left: miniTitleLeft,
                top: miniTitleTop,
                width: miniTitleWidth,
                lineHeight: miniTitleHeight,
                opacity: morph.miniTitleOpacity,
              },
            ]}
            numberOfLines={1}
          >
            {session.meta.title ?? ''}
          </Animated.Text>
          {/* 미니 카테고리 — 미니플레이어의 제목 아래 줄(MiniPlayer styles.category)과 같은 자리·글자. 이게 없으면
              착지 순간 뒤의 진짜 미니플레이어에서 카테고리만 툭 나타난다(2026-09-22 PM) */}
          {categoryLabel !== null ? (
            <Animated.Text
              style={[
                styles.morphMiniCategory,
                {
                  left: miniTitleLeft,
                  top: miniTitleTop + miniTitleHeight + MINI_CATEGORY_GAP,
                  width: miniTitleWidth,
                  opacity: morph.miniTitleOpacity,
                },
              ]}
              numberOfLines={1}
            >
              {categoryLabel}
            </Animated.Text>
          ) : null}
          {/* 풀 화면 제목 — 최종 자리에 고정된 채 콘텐츠(컨트롤·시크바)와 같은 이동·불투명도로 들어온다.
              마지막 교차(0.94~1)에서 실제 히어로 제목과 같은 좌표라 한 장으로 보인다 */}
          {/* 실제 히어로와 **같은 컴포넌트·같은 간격**으로 그린다 — 말줄임 Text 로 그리면 교차 순간 흐르는 제목
              (끝이 페이드)과 끝 모양이 달라 글자가 겹쳐 보인다. 카테고리도 함께 둬 교차 때 새로 튀어나오지 않게 한다 */}
          <Animated.View
            style={[
              styles.morphFullMeta,
              {
                left: fullTitle.left,
                top: fullTitle.top,
                width: fullTitle.width,
                opacity: morph.contentOpacity,
                transform: [{ translateY: morph.contentTranslateY }],
              },
            ]}
          >
            <MarqueeText
              text={session.meta.title ?? ''}
              style={[
                isHeroCompact ? styles.compactTitle : styles.title,
                isQueueOpen && styles.onImageTitle,
              ]}
              isPaused
            />
            {categoryLabel !== null ? (
              <Text
                style={[styles.category, isQueueOpen && styles.onImageCategory]}
                numberOfLines={1}
              >
                {categoryLabel}
              </Text>
            ) : null}
          </Animated.View>
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

      <PlayerSleepTimerSheet
        isVisible={screen.isSleepTimerSheetVisible}
        currentChoice={sleepTimerChoice}
        onSelect={selectSleepTimer}
        onClose={screen.closeSleepTimerSheet}
      />
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
/** 펼침·접힘 전환이 사실상 멈추는 시간 — smooth 스프링(응답 0.45초)이 감쇠하는 길이. 위치 틱 보류에 쓴다 */
const SCRIPT_TOGGLE_DURATION_MS = 450;
/**
 * 재생 목록을 끌어올렸을 때의 히어로 높이 — 앨범 사진이 화면 가로를 꽉 채우고 앱바·제목·시크바까지 그 위에
 * 얹힌다(2026-09-17 PM, 유튜브 뮤직). 사진 전체 높이 = 앱바 + 이 값 + 시크바
 */
const QUEUE_BANNER_HEIGHT = 232;
/** 사진 아래쪽 그라데이션 높이 — 제목·카테고리 블록과 재생바를 넉넉히 덮는다 */
const QUEUE_ART_FADE_HEIGHT = 160;
/** 재생 목록 열림 상태의 제목 줄(xl × 1.3)·카테고리 줄(sm 글자의 줄 높이) — 메타 블록을 사진 밑변에 맞추는 셈에 쓴다 */
const QUEUE_TITLE_LINE_HEIGHT = theme.font.size.xl * 1.3;
const QUEUE_CATEGORY_LINE_HEIGHT = 20;
/** 카테고리 줄 높이 — 스타일과 위 셈이 같은 값을 쓴다 */
const PLAYER_CATEGORY_LINE_HEIGHT = QUEUE_CATEGORY_LINE_HEIGHT;
/** 사진 위 텍스트·아이콘 색 */
const ON_IMAGE_COLOR = '#FFFFFF';
/** 손잡이를 놓았을 때 열림/닫힘 확정 — 이동 비율·속도(dp/ms). 실기기 검증 대상 제안값 */
const QUEUE_COMMIT_RATIO = 0.35;
const QUEUE_COMMIT_VELOCITY = 0.5;
/** 아래로 끌기 — 화면 높이의 이 비율만큼 끌면 진행값이 0(미니플레이어)에 닿는다 */
/** 목록을 받기 전의 빈 재생 목록 — 렌더마다 새 배열을 만들면 순서 계산(useMemo)이 매번 다시 돈다 */
const EMPTY_QUEUE: QueueItem[] = [];
/** 모션 아트워크의 도착 시점 — 0.92 에 풀 화면 자리에 서고 교차(0.94~1) 동안 움직이지 않는다 */
const MORPH_ART_ARRIVE = 0.92;
/**
 * 아트워크가 썸네일로 줄어드는 구간의 끝(닫힐 때 기준) — 이 값 위에서는 풀 사이즈로 시트에 실려 내려가기만 하고,
 * 이 값 아래에서 미니플레이어 썸네일 자리로 줄어든다(2026-09-22 PM — 애플 뮤직 방식). 손으로 끌 때 화면 높이의
 * 약 1/3 지점에서 줄어들기 시작하는 값 — 실기기에서 조절한다
 */
const MORPH_ART_SHRINK_END = 0.35;
const MORPH_ART_INPUT = [0, MORPH_ART_SHRINK_END, MORPH_ART_ARRIVE, 1];
/**
 * 시트 열림·닫힘·되돌림 스프링(2026-09-22 PM — "애플처럼"). iOS 시트의 기본 느낌인 임계 감쇠(튀지 않고 한 번에
 * 멈춤)·응답 약 0.45초를 stiffness·damping 으로 옮긴 값 — stiffness = (2π/응답)², damping = 2·√(stiffness·mass).
 * 손을 뗀 속도는 `velocity` 로 따로 넣는다. 실기기에서 조절한다
 */
const SHEET_SPRING = motion.spring.smooth;
/** 정지 시 아트워크 배율 — 애플 뮤직은 약 0.8 까지 줄인다. 그림자 없는 우리 사진은 조금 덜 줄여도 정지가 읽힌다 */
const PAUSED_ART_SCALE = 0.85;
/** 바탕 커버의 흐림 — 형태가 남지 않고 색 덩어리만 보일 만큼 */
const BACKDROP_BLUR_RADIUS = 60;
/** 흐린 커버 위 어두운 막 — 플레이어 바탕색(#17171A)의 72% */
const BACKDROP_SCRIM_COLOR = 'rgba(23, 23, 26, 0.72)';
/** 미니플레이어 카드의 내부 치수(MiniPlayer.tsx 스타일과 같아야 한다) — 진행바 2 · 썸네일 40(import) · 버튼 44 · 행 54 */
const MINI_PROGRESS_HEIGHT = 2;
const MINI_BUTTON_WIDTH = 44;
const MINI_ROW_HEIGHT = 54;
/** 미니플레이어 제목(14pt) 한 줄 높이 */
const MINI_TITLE_LINE_HEIGHT = 20;
/** 미니플레이어 제목과 카테고리 줄 사이(MiniPlayer styles.textColumn gap 과 같아야 한다) */
const MINI_CATEGORY_GAP = 2;
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
/**
 * 접힘 상태의 제목·카테고리 블록 높이 — 위 여백 24 + 제목 줄 36.4 + 간격 4 + 카테고리 20 = 84.4(숫자로 적지 않고
 * 같은 상수에서 셈한다 — 84 로 적었더니 두 상태의 간격이 0.4 어긋났다). **아래 여백은 두지 않는다**
 * (2026-09-19 PM — 재생 목록 열림 상태와 같은 간격으로): 바로 아래 시크바 터치 영역(44pt)의 위쪽 절반(≈20px)이
 * 이미 재생바까지의 여백이라, 여기에 8을 더 두면 카테고리와 재생바 사이가 벌어진다. 줄어든 만큼 아트워크가 커진다
 */
const HERO_META_BLOCK_HEIGHT =
  theme.spacing.lg + QUEUE_TITLE_LINE_HEIGHT + theme.spacing.xs + PLAYER_CATEGORY_LINE_HEIGHT;
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
    // 위 모서리 반지름은 모션이 움직인다(sheetRadius) — 곡률 종류만 여기서 연속으로 고정한다(iOS, 2026-09-22 PM)
    borderCurve: 'continuous',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // 흐린 가장자리는 투명해진다 — 살짝 키워 가장자리를 화면 밖으로 밀어낸다
  backdropImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.25 }],
  },
  // 글자·컨트롤 대비를 지키는 어두운 막 — 팔레트 바탕색을 그대로 써서 커버가 밝아도 전체 톤이 차콜에 머문다
  backdropScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BACKDROP_SCRIM_COLOR,
  },
  morphArtwork: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: playerColor.surface,
  },
  // 풀 화면 제목·카테고리 묶음 — 히어로의 제목 층(heroTitleLayer)과 같은 간격
  morphFullMeta: {
    position: 'absolute',
    gap: theme.spacing.xs,
  },
  morphTitle: {
    position: 'absolute',
    fontWeight: '700',
    color: playerColor.textPrimary,
  },
  // 미니플레이어 제목과 같은 글자(MiniPlayer styles.title) — 착지 순간 뒤의 진짜 제목과 겹쳐 한 장으로 보인다
  morphMiniTitle: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    // 이 순간의 시트는 아직 밝은 미니플레이어 색이다 — 밝은 테마의 글자색
    color: theme.color.textPrimary,
  },
  // 미니플레이어 카테고리와 같은 글자(MiniPlayer styles.category)
  morphMiniCategory: {
    position: 'absolute',
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
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
    // 상태바 밑에 바로 붙지 않게 — 아이콘 윗선이 탭 화면의 첫 요소(24)와 비슷한 선에 온다(2026-09-18 PM).
    // 재생 목록의 아트워크 높이는 앱바 실측(onAppBarLayout)을 쓰므로 함께 늘어난다
    paddingTop: theme.spacing.md,
  },
  // 수면 타이머 — 알약이 붙으면 옆으로 늘어난다. 히트 영역은 44pt 를 지킨다
  timerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
  },
  // 남은 시간 — 숫자 폭이 흔들리지 않게 고정폭 숫자. 사진 위에서도 읽히게 흰 글자
  timerPill: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: ON_IMAGE_COLOR,
    fontVariant: ['tabular-nums'],
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
    backgroundColor: playerColor.surface,
    // 애플식 연속 곡률(design.md 2장 — 모든 둥근 모서리). 반지름은 보간값(art.radius)이라 여기선 곡률만(17:22 PM)
    borderCurve: 'continuous',
  },
  heroArtTapArea: {
    position: 'absolute',
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
  // 둥근 모서리는 컨테이너(heroArtwork, overflow hidden)가 자른다 — 여기 radius 를 두면 확대돼 모서리가 0 이 될 때 흰 틈이 남는다
  artwork: {
    flex: 1,
    backgroundColor: playerColor.surface,
  },
  artworkPlaceholder: {
    backgroundColor: playerColor.surface,
  },
  compactTitle: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: playerColor.textPrimary,
    lineHeight: theme.font.size.lg * 1.3,
  },
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: playerColor.textPrimary,
    // 한 줄 마퀴 — lineHeight가 곧 뷰포트 높이다(MarqueeText)
    lineHeight: theme.font.size.xl * 1.3,
  },
  // 카테고리 — 제목 바로 아래, 보조색. 링크처럼 보이면 안 되므로 칩·밑줄을 두지 않는다
  // md(16) — sm(14)은 제목(28)의 절반이라 각주처럼 읽혔다(2026-09-19 PM). 줄 높이를 못 박아 세 자리
  // (기본·대본 압축 헤더·재생 목록 열림)의 블록 높이 셈이 글꼴 기본값에 흔들리지 않게 한다
  category: {
    fontSize: theme.font.size.md,
    lineHeight: PLAYER_CATEGORY_LINE_HEIGHT,
    fontWeight: '600',
    color: playerColor.textSecondary,
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
    color: playerColor.border,
  },
  // 64 — 어두운 테마에서 순백 72 원은 화면에서 가장 밝고 큰 덩어리라 아트워크보다 먼저 보였다(2026-09-18 PM).
  // 아이콘(28)은 그대로 둔다: 원 대비 39% → 44% 로 올라 저절로 또렷해진다
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: playerColor.primary,
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
    color: playerColor.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  // 스크립트 손잡이 — 화면 바닥에 붙는다. 바(pill) + 라벨이 "위로 끌어올릴 수 있다"를 말한다
  // 재생 목록 시트 — 절대 배치의 기준은 content 의 바깥 모서리(패딩 안쪽이 아니다 — 2026-09-17 웹 실측).
  // inset 0 이면 화면 폭을 꽉 채운다. 목록의 좌우 여백은 패널이 갖는다
  // 배경을 칠하지 않는다 — 흐린 커버 바탕이 목록 뒤까지 이어진다. 시트 위쪽은 늘 컨트롤 줄 아래라 겹칠 것이 없다
  queueSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  scriptHandleWrap: {},
  // 재생 목록 패널의 자리 — 패널 루트(flex 1)를 그대로 채운다. 터치 시작을 듣기 위한 래퍼다
  queuePanelWrap: {
    flex: 1,
    minHeight: 0,
  },
  // 사진 위 글자·시크바 대비 — 재생 목록이 열린 만큼 어두워진다
  queueArtFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: QUEUE_ART_FADE_HEIGHT,
  },
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
  /*
   * 기본 제목 층 — 사진 위 층(heroTitleOnImageLayer)과 **같은 간격**이어야 한다(2026-09-19). 이 층에만 간격이
   * 없어서 카테고리가 4px 위에 있었고, 그 탓에 (1) 재생바까지의 간격이 두 상태에서 23.6 / 20 으로 달랐고
   * (2) 재생 목록을 올리는 동안 두 층의 카테고리가 어긋난 채 교차해 글자가 겹쳐 보였다
   */
  heroTitleLayer: {
    gap: theme.spacing.xs,
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
    backgroundColor: playerColor.border,
  },
  scriptHandleLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: playerColor.textSecondary,
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
    color: playerColor.textPrimary,
  },
  bannerDescription: {
    fontSize: theme.font.size.xs,
    color: playerColor.textSecondary,
  },
  bannerAction: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  bannerActionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: playerColor.primary,
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
    color: playerColor.textPrimary,
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
    color: playerColor.primary,
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
    backgroundColor: playerColor.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  snackbarMessage: {
    fontSize: theme.font.size.sm,
    color: playerColor.onPrimary,
  },
  snackbarAction: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  snackbarActionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    // 스낵바 면이 흰색(textPrimary)이라 그 위 글자는 onPrimary(검정)
    color: playerColor.onPrimary,
  },
});
