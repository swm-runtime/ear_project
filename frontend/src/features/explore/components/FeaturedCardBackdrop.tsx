import { Image as ExpoImage } from 'expo-image';
import { Image, Platform, StyleSheet, View } from 'react-native';

/**
 * 대표 카드 하단(제목·알약 줄)의 바탕은 **앨범아트가 흐리게 이어진 면**이다(PM 2026-09-25 22:01 "blur 처리해서 마치
 * 이어진 것처럼"). 카드 전체에 흐린 커버를 깔고 위 정사각형만 선명한 커버가 덮는다 — 플레이어 배경과 같은 방식
 * (기본 Image blurRadius, expo-image 는 세기 기준이 달라 톤이 바뀐다). 우리 커버는 차콜 계열이라 하단 글자는
 * 플레이어 팔레트(흰 글자)로, 밝은 커버가 와도 읽히게 어두운 막을 한 겹 둔다.
 * 콘텐츠 대표 카드(ExploreFeaturedCard)와 시리즈 대표 카드(ExploreSeriesTile `featured`)가 같은 바탕을 쓴다(KAN-225)
 */
const BACKDROP_BLUR_RADIUS = 36;
const BACKDROP_SCRIM = 'rgba(23, 23, 26, 0.45)';
/** 흐린 커버 위 글자 — 두 모드 같다(design.md §1-1 "사진·썸네일 위 막과 흰 글자") */
export const ON_ART_TEXT = '#FFFFFF';
export const ON_ART_TEXT_SECONDARY = 'rgba(255, 255, 255, 0.72)';

interface FeaturedCardBackdropProps {
  uri: string;
  recyclingKey: string;
  /** 막 색 — 기본은 카드용 어두운 막. 시리즈 화면 표지 뒤 비침은 라이트 모드에서 흰 막을 쓴다 */
  scrimColor?: string;
}

/** 카드 전체에 까는 흐린 커버 + 어두운 막 — 카드(부모)가 라운드·클립한다 */
export default function FeaturedCardBackdrop({
  uri,
  recyclingKey,
  scrimColor,
}: FeaturedCardBackdropProps) {
  return (
    <>
      {/* 흐린 커버 바탕 — 카드 전체. 위 정사각형은 선명한 커버가 덮어 하단만 "이어진" 흐림으로 남는다 */}
      {Platform.OS === 'android' ? (
        /*
         * Android 는 기본 Image — expo-image 의 Android 흐림(glide-transformations BlurTransformation)은 RenderScript 를 쓰고,
         * 카드 여러 장이 동시에 흐림을 만들면 한쪽이 RS 컨텍스트를 닫은 사이 다른 쪽이 써서 앱이 죽었다
         * (Sentry EAR-APP-F RSInvalidStateException, 2026-10-09 — 주제 칩을 여러 번 오가며). 기본 Image 의 흐림은 RS 를 안 쓴다.
         * 플레이어 배경도 같은 이유로 기본 Image 다
         */
        <Image
          source={{ uri }}
          style={styles.backdrop}
          blurRadius={BACKDROP_BLUR_RADIUS}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : (
        <ExpoImage
          source={{ uri }}
          style={styles.backdrop}
          blurRadius={BACKDROP_BLUR_RADIUS}
          contentFit="cover"
          // iOS 는 expo-image — 메모리 캐시로 구간 전환·피드 복귀 때 바로 뜬다(종전 RN Image 는 다시 그릴 때마다 받아 흐리게
          // 다시 그려 그동안 카드 바탕이 비었다 — PM 2026-10-09 흰 깜빡임). iOS 흐림은 RenderScript 와 무관하다
          cachePolicy="memory-disk"
          recyclingKey={recyclingKey}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <View
        style={[styles.backdropScrim, scrimColor ? { backgroundColor: scrimColor } : null]}
        pointerEvents="none"
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // 흐림의 가장자리가 비치지 않게 살짝 키운다(플레이어 배경과 같다)
    transform: [{ scale: 1.2 }],
  },
  backdropScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BACKDROP_SCRIM,
  },
});
