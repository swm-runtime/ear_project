import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  View,
  useAnimatedValue,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { motion } from '@/shared/theme';
import RemoteImage from '@/shared/ui/RemoteImage';

/**
 * 편이 바뀔 때(자동 재생 — player.md 4.2-4) 커버·흐린 바탕의 **교차 페이드** 길이. 종전엔 사진이 주소를 키로 다시 만들어져
 * 새 사진이 풀릴 때까지 칸이 비었다가 툭 바뀌었다(PM 2026-10-23 "자동 재생 전환이 부자연스럽다"). 애플 뮤직처럼 앞 편 위로
 * 새 편이 서서히 덮인다
 */
export const PLAYER_CROSSFADE_MS = 320;

interface Layer {
  uri: string;
  /** 화면이 처음 열릴 때의 사진 — 페이드 없이 바로 보인다(열기 전환이 따로 있다) */
  isInitial: boolean;
}

/**
 * 겹 목록 — 주소가 바뀌면 새 겹을 위에 얹고, 새 겹이 다 나타나면 아래 겹을 걷는다. 겹은 많아야 셋(연타로 넘겨도 바로 앞 한 장만 남긴다)
 */
const useCrossfadeLayers = (uri: string | null) => {
  const [layers, setLayers] = useState<Layer[]>(() => (uri ? [{ uri, isInitial: true }] : []));
  // 렌더 중 상태 맞춤 — 주소가 바뀐 그 렌더에 새 겹을 얹는다(효과로 미루면 한 프레임 빈 칸이 보인다)
  const [lastUri, setLastUri] = useState(uri);
  if (uri !== lastUri) {
    setLastUri(uri);
    setLayers((prev) =>
      uri
        ? [...prev.filter((layer) => layer.uri !== uri).slice(-1), { uri, isInitial: false }]
        : [],
    );
  }
  /** 이 겹이 다 나타났다 — 그 아래 겹들을 걷는다 */
  const settle = useCallback((settledUri: string) => {
    setLayers((prev) => {
      const index = prev.findIndex((layer) => layer.uri === settledUri);
      return index <= 0 ? prev : prev.slice(index);
    });
  }, []);
  return { layers, settle };
};

/**
 * 플레이어 커버 — 편이 바뀌면 앞 사진 위로 새 사진이 페이드로 덮인다. 주소가 없으면 빈 면(`style` 의 바탕색)만 그린다
 */
export function CrossfadeArtwork({
  uri,
  style,
}: {
  uri: string | null;
  style: StyleProp<ViewStyle>;
}) {
  const { layers, settle } = useCrossfadeLayers(uri);
  // 새 사진의 페이드(expo-image transition)가 끝난 뒤에 아래 겹을 걷는다
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
    },
    [],
  );
  const settleAfterFade = useCallback(
    (layer: Layer) => {
      if (layer.isInitial) return;
      timersRef.current.push(setTimeout(() => settle(layer.uri), PLAYER_CROSSFADE_MS));
    },
    [settle],
  );
  return (
    <View style={style}>
      {layers.map((layer) => (
        <RemoteImage
          key={layer.uri}
          uri={layer.uri}
          style={StyleSheet.absoluteFill}
          isResized
          fadeInMs={layer.isInitial ? undefined : PLAYER_CROSSFADE_MS}
          onLoad={() => settleAfterFade(layer)}
          onError={() => settleAfterFade(layer)}
        />
      ))}
    </View>
  );
}

function BackdropLayer({
  layer,
  imageStyle,
  blurRadius,
  onSettled,
}: {
  layer: Layer;
  imageStyle: StyleProp<ImageStyle>;
  blurRadius: number;
  onSettled: (uri: string) => void;
}) {
  const opacity = useAnimatedValue(layer.isInitial ? 1 : 0);
  const reveal = () => {
    if (layer.isInitial) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: PLAYER_CROSSFADE_MS,
      easing: motion.easing.easeInOut,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onSettled(layer.uri);
    });
  };
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <Image
        source={{ uri: layer.uri }}
        style={imageStyle}
        // 흐린 바탕은 기본 Image 다(KAN-78 — expo-image 의 blurRadius 는 세기 기준이 달라 톤이 바뀐다)
        blurRadius={blurRadius}
        resizeMode="cover"
        onLoad={reveal}
        onError={reveal}
      />
    </Animated.View>
  );
}

/** 흐린 커버 바탕 — 커버와 같은 길이로 교차 페이드한다 */
export function CrossfadeBackdrop({
  uri,
  imageStyle,
  blurRadius,
}: {
  uri: string;
  imageStyle: StyleProp<ImageStyle>;
  blurRadius: number;
}) {
  const { layers, settle } = useCrossfadeLayers(uri);
  return (
    <>
      {layers.map((layer) => (
        <BackdropLayer
          key={layer.uri}
          layer={layer}
          imageStyle={imageStyle}
          blurRadius={blurRadius}
          onSettled={settle}
        />
      ))}
    </>
  );
}
