import { useEffect } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logger } from '@/shared/lib/logger';
import { STORE_URL } from '@/shared/lib/store-url';
import { theme } from '@/shared/theme';

import { APP_UPDATE_COPY } from '../app-update.copy';

const LOGO = require('../../../../assets/logo.png');
const LOGO_SIZE = 120;

/**
 * 강제 업데이트 화면(`splash.md` 4.1 · `common-error-handling.md` 9장 "전체 화면, [스토어로 이동]만, 닫기 불가").
 * 서버가 426 을 주면 관문(RootNavigator)이 이 화면 **하나만** 그린다 — 스택에 뒤가 없으니 스와이프로 나갈 곳이 없고,
 * Android 하드웨어 뒤로가기는 여기서 삼킨다(기본 동작은 앱 종료인데, 그러면 "닫기 불가" 가 아니라 "꺼진다" 가 된다).
 * 버튼은 스토어 이동뿐이고 스토어에서 돌아와도 이 화면이다 — 새 버전은 다음 실행에서 서버가 다시 판정한다
 */
export default function ForceUpdateScreen() {
  useEffect(() => {
    // 화면 진입 시 제목·안내를 낭독한다(KAN-99 할 일 2 접근성)
    AccessibilityInfo.announceForAccessibility(APP_UPDATE_COPY.force.a11y);
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const openStore = (): void => {
    Linking.openURL(STORE_URL).catch((error) => logger.warn('[app-update] open store failed', error));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" accessibilityElementsHidden />
        <Text style={styles.title} accessibilityRole="header">
          {APP_UPDATE_COPY.force.title}
        </Text>
        <Text style={styles.description}>{APP_UPDATE_COPY.force.body}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={openStore}
        accessibilityRole="button"
        accessibilityLabel={APP_UPDATE_COPY.force.action}
      >
        <Text style={styles.buttonLabel}>{APP_UPDATE_COPY.force.action}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  // 기본 동작 버튼 — 검정 채움 · md + 연속 곡률(design.md §5)
  button: {
    minHeight: 56,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
});
