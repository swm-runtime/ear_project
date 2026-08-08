import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { SocialProvider } from '@/features/auth';

import { PROFILE_COPY } from '../profile.copy';

interface ProfileHeaderProps {
  nickname: string;
  provider: SocialProvider;
}

/**
 * 헤더 — 닉네임 + 로그인 제공자 표시(profile-uiux.md 4.1). 표시만 한다 — 탭해도 아무 일도
 * 일어나지 않는다(닉네임 편집·계정 통합은 MVP 비범위). 설정 아이콘은 화면이 스켈레톤 밖에
 * 항상 노출하므로 여기 없다. 제공자는 아이콘 리소스 도입 전까지 텍스트 칩이다(탭 라벨 선례).
 */
export default function ProfileHeader({ nickname, provider }: ProfileHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.nickname}>{nickname}</Text>
      <View
        style={styles.providerChip}
        accessibilityLabel={PROFILE_COPY.header.providerA11y(provider)}
      >
        <Text style={styles.providerText}>{PROFILE_COPY.header.providerName(provider)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  nickname: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    flexShrink: 1,
  },
  providerChip: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  providerText: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
});
