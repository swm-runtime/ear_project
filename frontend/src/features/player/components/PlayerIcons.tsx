import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';

interface IconProps {
  size: number;
  color: string;
}

/** 재생 — 삼각형. 원형 버튼 안에서 광학 중심이 맞도록 왼쪽 여백을 조금 더 준다 */
export function PlayIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d="M8 5.2 19 12 8 18.8z" />
    </Svg>
  );
}

/** 일시정지 — 두 막대 */
export function PauseIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d="M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z" />
    </Svg>
  );
}

/** 더보기 — 가로 점 3개 */
export function MoreIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.5" cy="12" r="1.8" fill={color} />
      <Circle cx="12" cy="12" r="1.8" fill={color} />
      <Circle cx="18.5" cy="12" r="1.8" fill={color} />
    </Svg>
  );
}

/** 바깥으로 나가는 링크 — 원문이 앱 밖으로 연다는 것을 알린다 */
export function ExternalLinkIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16 16 8M9.5 8H16v6.5"
      />
    </Svg>
  );
}

/**
 * 헤드폰 — "들을 수 있는 횟수"를 말한다. 재생 삼각형은 지금 누르면 재생된다는 뜻으로
 * 읽혀 잔여 표시에는 맞지 않는다(2026-09-02).
 */
export function HeadphonesIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        d="M4.6 14.5v-2.4a7.4 7.4 0 0 1 14.8 0v2.4"
      />
      <Rect x="2.4" y="13.4" width="4.6" height="7.4" rx="2.3" fill={color} />
      <Rect x="17" y="13.4" width="4.6" height="7.4" rx="2.3" fill={color} />
    </Svg>
  );
}

/**
 * ±10초 아이콘 — 왼쪽(또는 오른쪽) 위가 트인 원호 끝에 화살촉, 가운데 "10" (시안 2026-09-16).
 * 숫자는 SVG 글리프가 아니라 RN Text로 겹쳐 그린다 — 기기 폰트로 렌더돼 앱의 다른 숫자와 같은 얼굴이 된다.
 * 호: 중심(12,12) 반지름 8.5. 10시 반(화살촉)에서 시계 방향으로 8시까지 285° — 왼쪽 아래가 트인다.
 */
const SEEK_RING_PATH = 'M5.99 5.99A8.5 8.5 0 1 1 4.64 16.25';
/** 화살촉 — 호의 10시 반 끝에서 반시계(왼쪽 아래) 방향을 가리키는 삼각형 */
const SEEK_HEAD_PATH = 'M4.25 7.75L7.95 7.35L4.63 4.03Z';
/** 앞으로 — 호·화살촉을 좌우 반전. 숫자는 그대로 */
const MIRROR = 'translate(24 0) scale(-1 1)';

/** 누를 때 원호가 한 바퀴 도는 시간 — 빠르게 출발해 부드럽게 멈춘다. 연타를 방해하지 않을 만큼 짧게 */
const SEEK_SPIN_MS = 480;

interface SeekIconProps extends IconProps {
  mirrored: boolean;
  /**
   * 값이 바뀔 때마다 원호·화살촉이 가리키는 방향으로 **한 바퀴** 돌아 제자리에 선다(2026-09-18 PM —
   * 애플 팟캐스트·유튜브의 ±초 버튼 피드백). 숫자 "10"은 돌지 않는다. 버튼을 누른 횟수를 넘기면 된다
   */
  spinKey?: number;
}

function SeekIcon({ size, color, mirrored, spinKey = 0 }: SeekIconProps) {
  const spin = useAnimatedValue(0);
  useEffect(() => {
    if (spinKey === 0) return;
    // 연타하면 앞선 회전을 끊고 처음부터 — 탭마다 같은 크기의 반응이 나온다
    spin.setValue(0);
    const animation = Animated.timing(spin, {
      toValue: 1,
      duration: SEEK_SPIN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [spinKey, spin]);
  // 뒤로 = 반시계, 앞으로 = 시계 — 화살촉이 가리키는 방향이다
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    // 한 바퀴 — 360° 는 0° 와 같은 모습이라 끝나면 그대로 제자리다(되돌리는 동작이 없다)
    outputRange: ['0deg', mirrored ? '360deg' : '-360deg'],
  });

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d={SEEK_RING_PATH}
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
            transform={mirrored ? MIRROR : undefined}
          />
          <Path d={SEEK_HEAD_PATH} fill={color} transform={mirrored ? MIRROR : undefined} />
        </Svg>
      </Animated.View>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Text
          style={[seekStyles.label, { color, fontSize: size * 0.4, lineHeight: size }]}
          allowFontScaling={false}
        >
          10
        </Text>
      </View>
    </View>
  );
}

/** 10초 뒤로 — 왼쪽이 트인 반시계 화살표 원호 + "10" */
export function SeekBackIcon(props: IconProps & { spinKey?: number }) {
  return <SeekIcon {...props} mirrored={false} />;
}

/** 10초 앞으로 — 오른쪽이 트인 시계 화살표 원호 + "10" */
export function SeekForwardIcon(props: IconProps & { spinKey?: number }) {
  return <SeekIcon {...props} mirrored />;
}

const seekStyles = StyleSheet.create({
  label: {
    textAlign: 'center',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

/** 다음 재생 목록 — 줄 세 개 + 재생 삼각형(2026-09-16 추가). 선 굵기는 ±10초 아이콘의 호와 같다 */
export function QueueIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 7h12M4 12h12M4 17h7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M14 14v6l5.5-3z" fill={color} />
    </Svg>
  );
}

/**
 * 수면 타이머 — **통통한 초승달 + z z**(2026-09-19 PM, 애플의 `moon.zzz` 문법).
 *
 * - 가는 선 초승달은 작은 크기에서 달이 아니라 "C"·괄호로 읽혔고, 달 하나만 있으면 다크 모드 전환으로도 읽힌다.
 *   몸통이 두꺼운 초승달(오목한 쪽이 오른쪽 위)에 그 오목한 자리로 작은 z 두 개를 넣어 "잠"을 명시한다.
 * - 꺼짐 = 선, **켜짐(`filled`) = 채움** — 애플이 시스템 전반에서 쓰는 규칙이다(선 = 비활성, 채움 = 활성).
 *   색이 아니라 형태로 구분한다. z 는 어느 상태에서도 선이다.
 * - 달은 24칸 안에서 왼쪽 아래로 치우쳐 앉고 z 가 오른쪽 위를 채워, 묶음 전체의 중심이 (12,12) 근처에 온다.
 *   선 굵기는 ±10초 아이콘과 같은 1.8, z 는 작아서 1.5
 */
const SLEEP_MOON_PATH = 'M16.44 13.94A7.56 7.56 0 1 1 8.22 5.72 5.88 5.88 0 0 0 16.44 13.94z';
const SLEEP_Z_PATH = 'M14.4 3.2h4.4l-4.4 4.8h4.4M19.7 9.8h2.9l-2.9 3.2h2.9';

export function SleepTimerIcon({ size, color, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={SLEEP_MOON_PATH}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
      <Path
        d={SLEEP_Z_PATH}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * 스크립트 — 길이가 다른 가로줄 세 개("글"). 말풍선은 채팅으로, T 는 글꼴 도구로 읽혔다(2026-09-18 PM, 4안 중 채택).
 * 크기는 ±10초 링(지름 17칸)에 맞춘다 — 가장 긴 줄 13칸, 줄 간격 5칸, 세 줄의 중심이 (12,12).
 * 선은 1.5 — 짧은 선 셋이 나란히 있어 링(1.8)과 같은 굵기면 잉크가 몰려 더 무거워 보인다(2026-09-18 PM).
 * 재생 목록 아이콘(줄 + 재생 삼각형)과 헷갈리지 않게 삼각형 없이 줄 길이만 달리한다
 */
export function ScriptIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5.5 7h13M5.5 12h9M5.5 17h11"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * 순서 변경 손잡이 — 가로줄 두 개(재생 목록 행 오른쪽, 2026-09-18). 잡고 끄는 자리라는 관례 표식이다.
 * 대본 아이콘(길이가 다른 세 줄)과 헷갈리지 않게 같은 길이 두 줄로 둔다
 */
export function ReorderIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 9.5h14M5 14.5h14"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
