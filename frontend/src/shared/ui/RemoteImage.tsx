import { Image, type ImageStyle } from 'expo-image';
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
export default function RemoteImage({
  uri,
  style,
  recyclingKey,
  onLoad,
  onError,
}: RemoteImageProps) {
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="cover"
      cachePolicy="disk"
      recyclingKey={recyclingKey}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
