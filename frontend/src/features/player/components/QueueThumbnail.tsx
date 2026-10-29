import { memo, useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { theme } from '@/shared/theme';
import RemoteImage from '@/shared/ui/RemoteImage';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';

import { playerColor } from '../player.theme';

interface QueueThumbnailProps {
  /** 없으면(서버가 썸네일을 안 실은 편) 단색 칸 — 받을 것이 없으니 반짝이지 않는다 */
  uri: string | null;
  /** 줄의 콘텐츠 id — `RemoteImage` 재사용 키이자 로드 상태의 키 일부 */
  recyclingKey: string;
  size: number;
}

type LoadStatus = 'loaded' | 'failed';

/**
 * 재생 목록(PL12) 줄의 썸네일(KAN-283) — 받는 동안 목록 로딩 스켈레톤과 같은 숨쉬기(`playerColor.skeleton`)를 깐다.
 *
 * - **반짝임은 이미지 밑에 깐다.** 이미지가 그려지는 순간(네이티브) 위에서 덮으므로, JS 의 `onLoad` 가 늦게 와도 스켈레톤이
 *   이미지 위로 비치지 않는다. 캐시된 썸네일은 첫 프레임에 바로 덮인다.
 * - **0.3초 안에 뜨면 반짝임을 그리지 않는다**(`useDelayedVisible` — design.md §5 스켈레톤, common-error-handling.md 5). 그 전에는
 *   빈 자리다. 캐시(메모리·디스크) 적중은 거의 다 이 안이라 루프도 돌지 않는다 — 다시 열 때마다 줄 수십 개가 반짝였다 꺼지지 않는다.
 * - **페이드인은 두지 않는다.** expo-image 의 `transition` 은 캐시 적중에도 매번 페이드한다(iOS `renderSourceImage`·Android
 *   `onResourceReady` 둘 다 출처를 보지 않는다) — 시트를 열 때마다 썸네일이 깜빡인다.
 * - **로드 상태는 `recyclingKey`·주소에 묶는다.** 키가 바뀌면 지난 줄의 "다 받음/실패"가 따라오지 않고 다시 받는 중이 된다 —
 *   effect 로 되돌리지 않고 렌더 중에 파생한다.
 * - 받기에 실패했거나 주소가 없으면 단색 칸(`playerColor.surface`)으로 멈춘다 — 영원히 로딩처럼 반짝이지 않게.
 * - 동작 줄이기는 `SkeletonGroup` 이 처리한다(정지한 블록).
 */
function QueueThumbnail({ uri, recyclingKey, size }: QueueThumbnailProps) {
  const loadKey = `${recyclingKey}\n${uri ?? ''}`;
  const [settled, setSettled] = useState<{ key: string; status: LoadStatus } | null>(null);
  const status = settled?.key === loadKey ? settled.status : null;
  const isPending = uri !== null && status === null;
  const isSkeletonVisible = useDelayedVisible(isPending);

  // 콜백은 그 주소의 키를 잡는다 — 지난 줄의 결과가 새 키로 기록되지 않게
  const handleLoad = useCallback(() => setSettled({ key: loadKey, status: 'loaded' }), [loadKey]);
  const handleError = useCallback(() => setSettled({ key: loadKey, status: 'failed' }), [loadKey]);

  const box = { width: size, height: size };

  if (uri === null || status === 'failed') {
    return <View style={[styles.frame, styles.flat, box]} />;
  }

  return (
    <View style={[styles.frame, box]}>
      {isPending && isSkeletonVisible ? (
        // 줄(Pressable)이 낭독 단위다 — 썸네일 자리의 "불러오는 중"은 따로 읽히지 않게 숨긴다
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="queue-thumbnail-skeleton"
        >
          <SkeletonGroup style={StyleSheet.absoluteFill} color={playerColor.skeleton}>
            <SkeletonBlock width={size} height={size} radius="sm" />
          </SkeletonGroup>
        </View>
      ) : null}
      <RemoteImage
        uri={uri}
        recyclingKey={recyclingKey}
        style={StyleSheet.absoluteFill}
        onLoad={handleLoad}
        onError={handleError}
      />
    </View>
  );
}

export default memo(QueueThumbnail);

const styles = StyleSheet.create({
  frame: {
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  flat: {
    backgroundColor: playerColor.surface,
  },
});
