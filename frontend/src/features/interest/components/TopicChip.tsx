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
 *
 * **키는 주제 이름이다.** id 로 잡으면 mock(`topic-economy`)과 서버(UUID)가 서로 달라
 * 실서버에서는 전부 기본 사진으로 떨어진다(2026-09-06 실기기 확인). 이름은 환경이 달라도
 * 같으므로 mock·개발 서버·운영 서버에서 모두 맞는다.
 *
 * 목록에 없는 주제(관리자가 새로 추가한 주제)는 기본 사진으로 떨어진다 — 그때 여기에 더한다.
 */
const TOPIC_IMAGE: Record<string, ImageSourcePropType> = {
  // 돈·경제
  재테크: require('../../../../assets/topics/topic-investing.jpg'),
  '경제 상식': require('../../../../assets/topics/topic-economy.jpg'),
  투자: require('../../../../assets/topics/topic-invest.jpg'),
  부동산: require('../../../../assets/topics/topic-real-estate.jpg'),
  // 일
  커리어: require('../../../../assets/topics/topic-career.jpg'),
  생산성: require('../../../../assets/topics/topic-productivity.jpg'),
  리더십: require('../../../../assets/topics/topic-leadership.jpg'),
  커뮤니케이션: require('../../../../assets/topics/topic-communication.jpg'),
  조직: require('../../../../assets/topics/topic-organization.jpg'),
  산업안전: require('../../../../assets/topics/topic-safety.jpg'),
  디자인: require('../../../../assets/topics/topic-design.jpg'),
  // 비즈니스
  마케팅: require('../../../../assets/topics/topic-marketing.jpg'),
  스타트업: require('../../../../assets/topics/topic-startup.jpg'),
  트렌드: require('../../../../assets/topics/topic-trend.jpg'),
  경영: require('../../../../assets/topics/topic-management.jpg'),
  // 과학·기술
  '데이터·AI': require('../../../../assets/topics/topic-data-ai.jpg'),
  'IT·개발': require('../../../../assets/topics/topic-it-dev.jpg'),
  자연과학: require('../../../../assets/topics/topic-science.jpg'),
  // 심리·마음
  심리학: require('../../../../assets/topics/topic-psychology.jpg'),
  '뇌과학·인지': require('../../../../assets/topics/topic-neuro.jpg'),
  '습관·동기': require('../../../../assets/topics/topic-habit.jpg'),
  인간관계: require('../../../../assets/topics/topic-relationship.jpg'),
  // 인문·교양
  철학: require('../../../../assets/topics/topic-philosophy.jpg'),
  역사: require('../../../../assets/topics/topic-history.jpg'),
  '사회·문화': require('../../../../assets/topics/topic-society.jpg'),
  예술: require('../../../../assets/topics/topic-art.jpg'),
  // 자격증·시험 — 시험이 다루는 영역의 사진을 함께 쓴다
  TOPCIT: require('../../../../assets/topics/topic-topcit.jpg'),
  한능검: require('../../../../assets/topics/topic-korean-history.jpg'),
  공인중개사: require('../../../../assets/topics/topic-real-estate.jpg'),
  산업안전기사: require('../../../../assets/topics/topic-safety.jpg'),
  // 구 체계 잔재 — 서버에서 아직 지워지지 않았다. 같은 영역의 사진을 물려 쓴다
  '커리어 성장': require('../../../../assets/topics/topic-career.jpg'),
  '이직·면접': require('../../../../assets/topics/topic-career.jpg'),
  'AI·테크 트렌드': require('../../../../assets/topics/topic-data-ai.jpg'),
  경제: require('../../../../assets/topics/topic-economy.jpg'),
  '인문·교양': require('../../../../assets/topics/topic-humanities.jpg'),
  글쓰기: require('../../../../assets/topics/topic-writing.jpg'),
  세계사: require('../../../../assets/topics/topic-world-history.jpg'),
};

const FALLBACK_IMAGE: ImageSourcePropType = require('../../../../assets/topics/default.jpg');

/** 주제 배경 사진 조회 — 선택 요약 칩 등 다른 표현이 같은 사진을 쓰게 한다 */
export const topicImageSource = (topicName?: string): ImageSourcePropType =>
  (topicName && TOPIC_IMAGE[topicName]) || FALLBACK_IMAGE;

interface TopicChipProps {
  label: string;
  /** 배경 사진은 `label`(주제 이름)로 찾는다 — 아래 topicImageSource 주석 참고 */
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
  const source = topicImageSource(label);

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
    /*
     * 배경 사진의 가로세로비에 맞춘 높이다. 주제 사진은 전부 800x320(2.50:1)이고
     * 온보딩 알약 폭이 156이므로, 높이 62면 156/62 = 2.52 로 **크롭이 사실상 0**이 된다.
     * 52였을 때는 3.00:1 이라 세로가 17% 잘려 나갔고 — 원본이 이미 한 번 잘린 상태라
     * 피사체가 두 번 잘려 무엇을 찍은 사진인지 알아볼 수 없었다(2026-09-08 iOS 실기기).
     * 사진을 바꾸려면 이 비(2.50:1)를 함께 본다.
     */
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
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
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
