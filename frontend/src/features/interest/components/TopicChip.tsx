import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { topicImageSource } from '../interest.images';

/**
 * 알약 최소 폭 — 폭은 라벨에 맞추되(PM 확정 2026-10-19 "알약 가로길이는 글자 크기에 맞추자"), 두 글자 이름("투자"·"철학")은
 * 라벨 32 + 여백 48 = 80 으로 거의 동그라미가 돼 칩으로 읽히지 않는다. 세 글자 이름의 자연 폭(96)을 바닥으로 둔다.
 * 높이 62 와 함께 터치 타깃 44pt 는 넉넉히 넘는다
 */
export const TOPIC_CHIP_MIN_WIDTH = 96;

interface TopicChipProps {
  label: string;
  /**
   * 배경 사진 키 — `slug` 먼저, 없거나 모르는 값이면 `label`(주제 이름)로 찾는다(interest.images.ts).
   * slug 를 싣는 응답(GET /onboarding/topics)을 그리는 화면은 꼭 넘긴다 — 영어(GLOBAL) 주제는 이름 키가 없다
   */
  slug?: string | null;
  topicId?: string;
  isSelected: boolean;
  /** 상한을 채운 뒤의 미선택 칩 — 비활성 스타일을 입히되 탭은 받아 토스트를 띄운다(uiux 공통 규칙) */
  isDimmed: boolean;
  /** 비활성 이유의 낭독 힌트 — IM2는 상한 토스트, IM6은 초과 안내 문구를 쓴다(interest-management-uiux.md 7장) */
  dimmedHint?: string;
  /**
   * 배치 오버라이드(최대 폭·여백 등) — 폭은 칩이 라벨에 맞춰 스스로 정한다. 화면은 줄 폭을 넘지 않게 `maxWidth`를 준다
   * (넘치는 이름은 말줄임·글자 축소 대신 두 줄로 접힌다). 동작·시각 상태는 칩 소유 그대로다
   */
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
}

/**
 * 주제 선택 칩 — 온보딩 1단계와 관심사 관리가 같은 컴포넌트를 쓴다
 * (interest-management-uiux.md 5장 — 같은 목록·같은 순서·같은 칩 동작).
 * 시각은 사진 배경 알약: 어두운 오버레이 + 흰 라벨, 선택 시 오버레이만 짙어진다
 * (2026-09-03 개편 — changes/pending/onboarding-o1-visual-refresh.md).
 */
export default function TopicChip({
  label,
  slug,
  topicId,
  isSelected,
  isDimmed,
  dimmedHint,
  style,
  onPress,
}: TopicChipProps) {
  const source = topicImageSource({ slug, name: label });

  return (
    <Pressable
      style={[styles.chip, style]}
      onPress={onPress}
      accessibilityRole="checkbox"
      // disabled를 선언하지 않는다 — 상한 도달 칩도 탭을 받아 토스트를 띄우는 것이 규칙인데(uiux 4.1),
      // disabled로 알리면 낭독기 사용자는 "사용 안 함"으로 듣고 아예 누르지 않아 그 안내를 못 받는다.
      // 이유는 아래 hint로 미리 알린다.
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={label}
      accessibilityHint={isDimmed ? dimmedHint : undefined}
    >
      {/*
        ImageBackground + imageStyle 대신 absolute-fill Image를 직접 깐다 — 웹 렌더에서
        imageStyle의 borderRadius가 이미지 박스를 왜곡하는 문제를 피하고, 클리핑은
        칩(overflow hidden)이 한 번만 담당한다.
      */}
      <Image source={source} resizeMode="cover" style={styles.photo} />
      {/* 사진 위 가독성용 오버레이 — 선택은 짙은 면 + ✓, 상한 dim은 하얗게 물러난다 */}
      <View
        style={[
          styles.overlay,
          isSelected && styles.overlaySelected,
          isDimmed && styles.overlayDimmed,
        ]}
      />
      {/* 선택 표시는 짙은 오버레이만 — 체크 글리프는 두지 않는다. 낭독은 accessibilityState가 한다 */}
      <Text
        style={[styles.label, isDimmed && styles.labelDimmed]}
        // 한 줄이 기본이고, 화면이 준 최대 폭(줄 폭)을 넘을 때만 두 줄로 접힌다 — 종전 영어 글자 축소(0.85)는 걷어냈다
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    /*
     * 폭 = 라벨 + 라벨 좌우 여백(PM 확정 2026-10-19 — 한국어·영어 공통). 종전 고정 폭(한국어 156 · 영어 216)은
     * 짧은 이름에서 사진만 넓고 긴 영어 이름은 글자를 줄여야 들어갔다. 늘거나 줄지 않게 grow·shrink 를 끈다
     */
    flexGrow: 0,
    flexShrink: 0,
    minWidth: TOPIC_CHIP_MIN_WIDTH,
    // 알약 — 사진·오버레이 클리핑은 여기서 한 번만 한다
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    overflow: 'hidden',
    /*
     * 높이 62 — 고정 폭 156 시절 사진(800x320, 2.50:1)의 크롭이 0이 되던 값이다. 52였을 때는 세로가 17% 잘려
     * 무엇을 찍은 사진인지 알아볼 수 없었다(2026-09-08 iOS 실기기).
     * 폭이 라벨을 따르면서(2026-10-19) 짧은 이름(96)은 좌우가, 긴 이름(240 안팎)은 위아래가 잘린다 —
     * 그래서 주제 사진은 **피사체가 가운데 있는 구도**여야 한다. 사진을 바꿀 때 좁은·넓은 크롭을 함께 본다.
     */
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    /*
     * **패딩을 칩이 갖지 않는다.** 배경 사진의 `width/height: '100%'`가 부모의
     * **콘텐츠 박스**(패딩 제외)로 풀리기 때문이다 — 칩에 패딩이 있으면 사진 상자가
     * 그만큼 작아져 알약 가장자리에 배경이 드러난다(2026-09-08 iOS 실기기).
     * 좌우 여백은 아래 `label`이 갖는다. 사진은 알약 전체를 덮는다.
     */
  },
  /**
   * 배경 사진 — **inset만으로 채운다.** `width: '100%'`·`height: '100%'`를 함께 주면
   * 퍼센트가 부모의 **콘텐츠 박스**(패딩 제외)로 풀려서 알약보다 작은 상자가 되고,
   * 칩의 `paddingHorizontal: lg` · `paddingVertical: sm` 만큼 배경이 드러난다
   * (2026-09-07 iOS 실기기 — 사진이 한쪽으로 쏠리고 아래쪽에 흰 배경이 보였다).
   *
   * 바로 아래 `overlay`가 inset만 쓰고도 정확히 채워지는 것이 같은 이유의 반증이다.
   * 둘의 상자가 어긋나면 오버레이가 사진 밖까지 덮어 경계가 보인다.
   */
  /*
   * 배경 사진 — inset과 크기를 **함께** 준다.
   *
   * react-native-web 은 `Image` 래퍼에 **원본 크기(800x320)를 박아** 넣는다. inset만으로는
   * 크기가 잡히지 않아 알약(156x62) 밖으로 644px 넘쳤다(브라우저 실측 2026-09-08).
   * 그래서 퍼센트 크기가 필요하다. 그리고 위 `chip`에서 패딩을 걷어냈으므로 그 퍼센트가
   * 알약 전체와 같아진다 — 웹·iOS 양쪽에서 정확히 채워진다.
   */
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
  },
  overlaySelected: {
    backgroundColor: theme.color.photoScrim,
  },
  // 흐린 칩은 사진째 물러나야 한 덩어리로 읽힌다
  overlayDimmed: {
    backgroundColor: theme.color.backgroundWash,
  },
  label: {
    // 칩이 아니라 라벨이 좌우 여백을 갖는다 — 위 chip 주석 참조
    paddingHorizontal: theme.spacing.lg,
    fontSize: theme.font.size.md,
    // 선택 여부와 무관하게 굵기를 고정한다 — 선택 시 굵어지면 라벨 폭이 변해 시선이 튄다
    fontWeight: '700',
    // 두 줄로 접힐 때(줄 폭을 넘는 긴 이름) 가운데 정렬 — 한 줄일 때는 차이가 없다
    textAlign: 'center',
    color: theme.color.onPhoto,
    textShadowColor: theme.color.photoTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  labelDimmed: {
    color: theme.color.textSecondary,
    textShadowColor: 'transparent',
  },
});
