import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toTab } from '@/shared/navigation/to-tab';
import { theme } from '@/shared/theme';

import BellIcon from './BellIcon';
import { ARRIVAL_BANNER_DURATION_MS } from '../notification.constants';
import { NOTIFICATION_COPY } from '../notification.copy';
import { useNotificationStore } from '../store/notification.store';

const BELL_SIZE = 18;

interface NavStateLike {
  index?: number;
  routes: { name: string; state?: unknown }[];
}

/** 지금 보이는 화면의 라우트 이름 — 중첩 내비게이터를 끝까지 따라 내려간다 */
const focusedLeafName = (state: NavStateLike | undefined): string | null => {
  let current = state;
  let name: string | null = null;
  while (current) {
    const route = current.routes[current.index ?? 0];
    if (!route) break;
    name = route.name;
    current = route.state as NavStateLike | undefined;
  }
  return name;
};

/**
 * 포그라운드 수신의 인앱 배너(notification.md 4.5) — OS 배너 대신 그린다. Main 위에 얹는다.
 * **라이브러리를 보고 있으면 그리지 않는다** — 목록이 조용히 갱신되고(`onForegroundArrival`),
 * 라이브러리의 도착 배너가 같은 사건을 이미 말한다(library-uiux.md 4.1).
 */
export default function PushArrivalBanner() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const arrival = useNotificationStore((s) => s.foregroundArrival);
  const hide = useNotificationStore((s) => s.hideForegroundArrival);
  const isOnLibrary = useNavigationState((state) => focusedLeafName(state) === 'Library');

  // 무엇과 동기화하나: 배너 노출 ↔ 자동 소멸 타이머
  useEffect(() => {
    if (arrival === null) return;
    const timer = setTimeout(hide, ARRIVAL_BANNER_DURATION_MS);
    return () => clearTimeout(timer);
  }, [arrival, hide]);

  if (arrival === null || isOnLibrary) return null;

  const label =
    arrival.contentCount === null
      ? NOTIFICATION_COPY.push.arrivalBannerNoCount
      : NOTIFICATION_COPY.push.arrivalBanner(arrival.contentCount);

  const handlePress = (): void => {
    hide();
    // 배너는 도착을 알릴 뿐 재생을 시작시키지 않는다 — 1편이어도 라이브러리로 간다
    navigation.navigate('Main', toTab('Library'));
  };

  return (
    <Pressable
      style={[styles.banner, { top: insets.top + theme.spacing.sm }]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={NOTIFICATION_COPY.push.arrivalBannerHint}
      accessibilityLiveRegion="polite"
    >
      <BellIcon size={BELL_SIZE} color={theme.color.onPrimary} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.primary,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: {
    flex: 1,
    color: theme.color.onPrimary,
    fontSize: theme.font.size.md,
    fontWeight: '600',
  },
});
