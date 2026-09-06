import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { theme } from '@/shared/theme';

/**
 * 주제별 배경 사진 — 순수 표현이라 화면이 소유한다(서버 계약에 이미지 필드가 없다).
 * 전부 CC0/퍼블릭 도메인(Openverse 검색, 출처 표시 불요)이라 번들에 포함해도 문제없다.
 * 목록에 없는 주제(관리자가 새로 추가한 주제)는 기본 사진으로 떨어진다.
 */
const TOPIC_IMAGE: Record<string, ImageSourcePropType> = {
  'topic-economy': require('../../../../assets/topics/topic-economy.jpg'),
  'topic-writing': require('../../../../assets/topics/topic-writing.jpg'),
  'topic-data-ai': require('../../../../assets/topics/topic-data-ai.jpg'),
  'topic-psychology': require('../../../../assets/topics/topic-psychology.jpg'),
  'topic-leadership': require('../../../../assets/topics/topic-leadership.jpg'),
  'topic-world-history': require('../../../../assets/topics/topic-world-history.jpg'),
  'topic-humanities': require('../../../../assets/topics/topic-humanities.jpg'),
  'topic-topcit': require('../../../../assets/topics/topic-topcit.jpg'),
  'topic-real-estate': require('../../../../assets/topics/topic-real-estate.jpg'),
  'topic-safety': require('../../../../assets/topics/topic-safety.jpg'),
  'topic-korean-history': require('../../../../assets/topics/topic-korean-history.jpg'),
  'topic-design': require('../../../../assets/topics/topic-design.jpg'),
  'topic-investing': require('../../../../assets/topics/topic-investing.jpg'),
  'topic-marketing': require('../../../../assets/topics/topic-marketing.jpg'),
  'topic-startup': require('../../../../assets/topics/topic-startup.jpg'),
  'topic-productivity': require('../../../../assets/topics/topic-productivity.jpg'),
};

const FALLBACK_IMAGE: ImageSourcePropType = require('../../../../assets/topics/default.jpg');

/** 주제 배경 사진 조회 — 선택 요약 칩 등 다른 표현이 같은 사진을 쓰게 한다 */
export const topicImageSource = (topicId?: string): ImageSourcePropType =>
  (topicId && TOPIC_IMAGE[topicId]) || FALLBACK_IMAGE;

interface TopicChipProps {
  label: string;
  /** 배경 사진 조회 키 — 없으면 기본 사진을 쓴다. 선택 동작에는 관여하지 않는다 */
  topicId?: string;
  isSelected: boolean;
  /** 상한을 채운 뒤의 미선택 칩 — 비활성 스타일을 입히되 탭은 받아 토스트를 띄운다(uiux 공통 규칙) */
  isDimmed: boolean;
  /** 비활성 이유의 낭독 힌트 — IM2는 상한 토스트, IM6은 초과 안내 문구를 쓴다(interest-management-uiux.md 7장) */
  dimmedHint?: string;
  /** 배치(폭·flex) 오버라이드 — 화면이 격자/가로 흐름을 정한다. 동작·시각 상태는 칩 소유 그대로다 */
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
  topicId,
  isSelected,
  isDimmed,
  dimmedHint,
  style,
  onPress,
}: TopicChipProps) {
  const source = topicImageSource(topicId);

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
        style={[styles.overlay, isSelected && styles.overlaySelected, isDimmed && styles.overlayDimmed]}
      />
      {/* 선택 표시는 짙은 오버레이만 — 체크 글리프는 두지 않는다. 낭독은 accessibilityState가 한다 */}
      <Text style={[styles.label, isDimmed && styles.labelDimmed]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    /*
     * 2열 격자 — 내용 폭에 맡기면 한 줄에 2개가 들어가고도 오른쪽이 크게 남는다.
     * 40%를 바닥으로 두고 남는 폭을 나눠 가지면 세 번째는 못 들어오고(120%),
     * 두 칸이 같은 폭으로 늘어 좌우 끝이 모두 맞는다(2026-09-02).
     * 마지막 홀수 칸은 한 줄을 다 쓴다 — 빈 칸을 남기는 것보다 낫다.
     */
    flexGrow: 1,
    flexBasis: '40%',
    // 알약 — 사진·오버레이 클리핑은 여기서 한 번만 한다
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    // 터치 타깃 44pt(uiux 7장)를 지키는 선에서 납작하게
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
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
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  // 흐린 칩은 사진째 물러나야 한 덩어리로 읽힌다
  overlayDimmed: {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
  },
  label: {
    fontSize: theme.font.size.md,
    // 선택 여부와 무관하게 굵기를 고정한다 — 선택 시 굵어지면 라벨 폭이 변해 시선이 튄다
    fontWeight: '700',
    color: theme.color.onPrimary,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  labelDimmed: {
    color: theme.color.textSecondary,
    textShadowColor: 'transparent',
  },
});
