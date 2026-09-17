import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

import { useSplashStore } from '../store/splash.store';

/** 모션 축소 설정에서 대신 두는 정지 로고 */
const SPLASH_STILL = require('../../../../assets/splash-icon.png');
/** 로고 모션 영상(1080×1920, 4.03초) — 선이 2.23초에 다 그려지고 나머지는 완성 로고로 머문다 */
const SPLASH_VIDEO = require('../../../../assets/splash-logo.mp4');

/** 영상에서 선이 다 그려지는 시점(67프레임 / 30fps) */
const SPLASH_DRAW_SEC = 2.233;
/** 다 그려진 뒤 머무는 시간 — 영상은 1.8초 머물지만 매 실행마다 보는 화면이라 줄였다. 영상 끝까지 보이려면 1800 */
const SPLASH_HOLD_MS = 800;
/** 모션 축소 설정 — 그릴 것이 없으니 종전 최소 노출(0.8초, splash.md 4-6)만 지킨다 */
const SPLASH_REDUCED_MS = 800;
/**
 * 안전장치 — 영상이 시작조차 못 하면(디코더 오류·자산 누락) 이 시간 뒤 무조건 관문을 연다.
 * 스플래시에 갇히는 것이 그리다 만 로고보다 나쁘다
 */
const SPLASH_MAX_WAIT_MS = 6000;
/** 재생 위치 통지 주기 — 다 그려진 시점을 이 오차 안에서 잡는다 */
const TIME_UPDATE_INTERVAL_SEC = 0.1;

/**
 * 실행 관문 화면(`splash.md` 4) — 세션 복원 판정이 끝날 때까지 유지한다.
 *
 * 로고 모션 영상(2026-09-17)을 화면 가운데 튼다 — 빈 흰 화면에서 선이 그려져 로고가 된다.
 * 영상 배경이 흰색이라 네이티브 스플래시(흰 바탕)에서 끊김 없이 이어진다.
 * **스피너를 두지 않는다.** 그려지는 선 자체가 진행 중임을 보여 준다.
 *
 * 관문은 판정이 끝나도 **선이 다 그려지고 잠시 머문 뒤**에야 넘어간다(`useSplashStore`).
 * 판정이 끝나기 전에는 다른 화면을 그리지 않는다 — 저장된 토큰이 있는데 로그인 화면이
 * 잠깐 보였다 바뀌면 로그아웃된 것으로 읽힌다.
 */
export default function SplashScreen() {
  const markMotionDone = useSplashStore((s) => s.markMotionDone);
  const [isReduceMotion, setIsReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) setIsReduceMotion(enabled);
      })
      .catch(() => {
        if (isMounted) setIsReduceMotion(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const player = useVideoPlayer(SPLASH_VIDEO, (instance) => {
    instance.loop = false;
    // 영상에 소리가 없지만 명시한다 — 다른 앱 재생을 끊거나 잠금화면 컨트롤을 띄우면 안 된다
    instance.muted = true;
    instance.audioMixingMode = 'mixWithOthers';
    instance.showNowPlayingNotification = false;
    instance.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_SEC;
  });

  useEffect(() => {
    if (isReduceMotion === false) player.play();
  }, [isReduceMotion, player]);

  // 다 그려진 시점을 영상의 재생 위치로 잡는다 — 시작이 늦어도 그리다 만 채로 잘리지 않는다
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const isDrawn = currentTime >= SPLASH_DRAW_SEC;

  useEffect(() => {
    if (isReduceMotion === null) return;
    if (isReduceMotion) {
      const timer = setTimeout(markMotionDone, SPLASH_REDUCED_MS);
      return () => clearTimeout(timer);
    }
    if (!isDrawn) return;
    const timer = setTimeout(markMotionDone, SPLASH_HOLD_MS);
    return () => clearTimeout(timer);
  }, [isReduceMotion, isDrawn, markMotionDone]);

  useEffect(() => {
    const timer = setTimeout(markMotionDone, SPLASH_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [markMotionDone]);

  return (
    <View
      style={styles.container}
      // 판정 중 화면이다 — 낭독기가 읽을 내용이 없다
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {isReduceMotion ? (
        // 모션 축소 — 그리는 과정 없이 완성된 로고
        <Image source={SPLASH_STILL} style={styles.still} resizeMode="contain" />
      ) : (
        <VideoView
          player={player}
          style={styles.video}
          // 박스 안에 영상 전체가 들어오게 맞춘다 — 여백은 배경과 같은 흰색이라 경계가 보이지 않는다
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * 영상 박스 = 화면 폭의 70%(영상 비율 9:16 유지). 전체 화면(cover·contain)은 로고가 화면 폭의 62%를
   * 차지해 로딩 화면이 아니라 포스터처럼 읽혔다(2026-09-17 PM). 70%면 로고 폭이 화면의 약 43%,
   * 정지 로고(160)와 같은 무게다. 명시적 width·height — 웹의 <video> 는 대체 요소라 inset 만으로는 안 늘어난다
   */
  video: {
    width: '70%',
    aspectRatio: 1080 / 1920,
  },
  still: {
    width: 160,
    height: 160,
  },
});
