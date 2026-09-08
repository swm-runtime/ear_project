import { Image, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';

/**
 * 실행 관문 화면(`splash.md` 4) — 세션 복원 판정이 끝날 때까지 유지한다.
 *
 * **스피너를 두지 않는다.** 대개 한 번의 왕복이라 금방 끝나고, 로딩 표시가 있으면 짧게
 * 번쩍여서 오히려 화면이 불안해 보인다. 네이티브 스플래시(앱 아이콘)와 같은 그림을 두어
 * **전환이 눈에 띄지 않게** 한다 — 사용자에게는 스플래시가 한 장으로 보인다.
 *
 * 판정이 끝나기 전에는 다른 화면을 그리지 않는다. 저장된 토큰이 있는데 로그인 화면이
 * 잠깐 보였다 바뀌면 "로그아웃됐나?"로 읽힌다.
 */
export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../../../assets/splash-icon.png')}
        style={styles.mark}
        resizeMode="contain"
        // 판정 중 화면이다 — 낭독기가 읽을 내용이 없다
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 160,
    height: 160,
  },
});
