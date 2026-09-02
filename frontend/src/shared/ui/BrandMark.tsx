import { Image, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

/** 서비스명 — 화면마다 흩어 적지 않는다 */
const BRAND_NAME = '이어';

interface BrandMarkProps {
  /** 심볼 한 변의 길이. 옆 글자는 이 값에 맞춰 따라간다 */
  size?: number;
}

/**
 * 로고 심볼 + 서비스명. 에셋 경로를 화면마다 require하지 않도록 여기 한 곳에 둔다.
 *
 * 심볼과 글자를 합쳐 **하나의 제목으로 읽힌다** — 낭독기가 "이미지, 이어"로 두 번
 * 말하지 않도록 심볼은 감추고 컨테이너에만 라벨을 붙인다.
 */
export default function BrandMark({ size = 28 }: BrandMarkProps) {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel={BRAND_NAME}>
      <Image
        source={require('../../../assets/logo.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={styles.name}>{BRAND_NAME}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  name: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
});
