import { StyleSheet, View } from 'react-native';

import { MINI_PLAYER_ZOOM_PROXY_ID, USE_NATIVE_PLAYER_ZOOM } from '@/shared/navigation/zoom-transition';

import { useMiniPlayerLayoutStore } from '../store/mini-player-layout.store';

/**
 * 줌 전환의 **소스 뷰 프록시** — 미니플레이어(탭 바 액세서리)와 같은 자리에 놓인 투명 뷰(2026-09-27 04:26).
 * 줌의 소스를 시스템 액세서리 컨테이너 안의 뷰로 두면, 닫힌 뒤 탭을 바꿀 때 플레이어가 한 프레임 다시 그려졌다
 * (줌 등록만 끄면 안 남 · 닫힌 뒤 provider 호출 없음 → 액세서리 컨테이너 쪽 잔여 이미지). 소스를 RN 루트의 일반 뷰로
 * 옮겨 액세서리와 줌 기계를 떼어 놓는다. 위치는 미니플레이어가 올리는 창 좌표(mini-player-layout.store).
 * 터치는 안 받고 그리지도 않는다 — 줌 축소가 이 사각형으로 향할 뿐이다. 시스템 탭 바 갈래에서만 둔다
 */
export default function ZoomSourceProxy() {
  const layout = useMiniPlayerLayoutStore((s) => s.layout);
  // 줌을 안 쓰면 둘 이유가 없다(2026-09-27 — JS 모프 복귀)
  if (!USE_NATIVE_PLAYER_ZOOM || !layout) return null;
  return (
    <View
      testID={MINI_PLAYER_ZOOM_PROXY_ID}
      pointerEvents="none"
      style={[
        styles.proxy,
        { left: layout.x, top: layout.y, width: layout.width, height: layout.height },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  proxy: {
    position: 'absolute',
    // 줌 기계가 "보이는 뷰"로 취급하게 크기만 있고 색은 없다
    backgroundColor: 'transparent',
  },
});
