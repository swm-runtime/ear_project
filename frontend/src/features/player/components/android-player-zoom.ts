import { Animated } from 'react-native';

/** 레이아웃을 매 프레임 바꾸지 않고 고정된 화면을 카드 사각형으로 이동·축소한다. */
export function createAndroidPlayerZoom(
  progress: Animated.Value,
  source: { x: number; y: number; width: number; height: number },
  target: { width: number; height: number },
  dismissProgress?: Animated.Value,
) {
  const width = Math.max(1, target.width);
  const height = Math.max(1, target.height);
  const interpolate = (from: number, to: number) =>
    progress.interpolate({ inputRange: [0, 1], outputRange: [from, to], extrapolate: 'clamp' });
  const scaleX = interpolate(Math.max(1, source.width) / width, 1);
  const scaleY = interpolate(Math.max(1, source.height) / height, 1);
  const top = interpolate(source.y, 0);

  return {
    frame: {
      top: 0,
      left: 0,
      width,
      height,
      transformOrigin: 'top left' as const,
      opacity: dismissProgress
        ? dismissProgress.interpolate({
            inputRange: [0, 0.2, 1],
            outputRange: [1, 1, 0],
            extrapolate: 'clamp',
          })
        : 1,
      transform: [
        { translateX: interpolate(source.x, 0) },
        {
          translateY: dismissProgress
            ? Animated.add(
                top,
                dismissProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, height],
                  extrapolate: 'clamp',
                }),
              )
            : top,
        },
        { scaleX },
        { scaleY },
      ],
    },
    // 카드의 세로 압축을 안쪽에서 상쇄해 글자·아트워크는 가로와 같은 비율로 확대한다.
    contentTransform: [{ scaleY: Animated.divide(scaleX, scaleY) }],
  };
}
