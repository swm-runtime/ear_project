import { Image, type ImageStyle } from 'expo-image';
import { useCallback, useRef } from 'react';
import type { StyleProp } from 'react-native';

interface RemoteImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  /**
   * 목록 타일처럼 **재사용되는 자리**에 준다(보통 콘텐츠 id). 값이 바뀌면 새 이미지가 뜨기 전에
   * 앞 이미지를 비운다 — 빠르게 스크롤할 때 남의 썸네일이 잠깐 비치는 잔상을 막는다.
   */
  recyclingKey?: string;
  onLoad?: () => void;
  onError?: () => void;
  /**
   * **크기가 애니메이션으로 바뀌는 자리**(플레이어 아트워크)에 켠다. expo-image 는 뷰의 크기가 바뀔 때마다
   * 이미지를 다시 불러온다(iOS `ImageView.bounds.didSet → reload()`, 표시 크기에 맞춰 다시 줄이려는 것) —
   * 크기를 매 프레임 움직이면 **매 프레임 다시 불러와** 모션이 끊긴다(2026-09-21 iOS 실기기: 대본을 펼칠 때
   * 아트워크가 줄어드는 모션). 로드가 끝나면 리소스를 잠가(`lockResourceAsync`) 그 뒤의 크기 변화에는 다시
   * 불러오지 않는다. 잠근 뷰는 주소가 바뀌어도 새로 불러오지 않으므로 **호출부가 `key={uri}` 로 새로 만든다.**
   */
  isResized?: boolean;
}

/**
 * 서버에서 받아 오는 이미지(썸네일·아트워크) — `expo-image`(KAN-78, 2026-09-20).
 *
 * 기본 `Image`는 iOS 에서 디스크 캐시가 약해 화면을 다시 열 때마다 다시 받고, 원본 크기 그대로
 * 디코드하며, 동시 디코드가 2개라 목록이 한 장씩 뜬다. expo-image 는 두 플랫폼 모두 디스크 캐시·
 * 표시 크기 다운샘플링·병렬 디코드를 한다. **번들에 든 정적 자산(로고·주제 사진)은 기본 `Image`를
 * 그대로 쓴다** — 받아 올 것도 캐시할 것도 없다.
 *
 * 전환 효과는 두지 않는다(`transition` 기본 없음) — 플레이어 열림 모션이 "로드 직후 한 프레임"에
 * 맞춰 출발하므로 페이드가 끼면 첫 컷이 빈다.
 */
/**
 * 곧 보일 이미지를 미리 받아 디스크 캐시에 넣는다. 실패는 조용히 넘긴다 — 미리 받기는 편의지
 * 조건이 아니다(못 받았으면 화면이 뜰 때 평소대로 받는다).
 */
export const prefetchRemoteImages = (uris: readonly string[]): void => {
  const targets = [...new Set(uris.filter((uri) => uri.length > 0))];
  if (targets.length === 0) return;
  Image.prefetch(targets, 'disk').catch(() => undefined);
};

export default function RemoteImage({
  uri,
  style,
  recyclingKey,
  onLoad,
  onError,
  isResized = false,
}: RemoteImageProps) {
  const imageRef = useRef<Image>(null);
  const handleLoad = useCallback(() => {
    if (isResized) {
      // 잠금 실패는 넘긴다 — 모션이 끊길 뿐 그림은 그대로 보인다. 웹에는 이 메서드가 없을 수 있다
      try {
        const view = imageRef.current;
        if (view && typeof view.lockResourceAsync === 'function') {
          view.lockResourceAsync().catch(() => undefined);
        }
      } catch {
        // 네이티브 뷰가 이미 내려간 경우 — 할 일이 없다
      }
    }
    onLoad?.();
  }, [isResized, onLoad]);

  return (
    <Image
      ref={imageRef}
      source={{ uri }}
      style={style}
      contentFit="cover"
      cachePolicy="disk"
      // 잠그는 자리는 원본 해상도로 풀어 둔다 — 작을 때(미니플레이어 자리·압축 헤더) 로드돼 그 크기로 줄여진 채
      // 잠기면 커졌을 때 흐리다. 플레이어 아트워크 한두 장이라 메모리 부담은 작다(768px WebP)
      allowDownscaling={!isResized}
      recyclingKey={recyclingKey}
      onLoad={handleLoad}
      onError={onError}
    />
  );
}
