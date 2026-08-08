import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { EmailCardVM, SectionState } from '../hooks/useProfileScreen';
import { PROFILE_COPY } from '../profile.copy';
import ProfileCard from './ProfileCard';

interface EmailCardProps {
  state: SectionState<EmailCardVM>;
  /** 카드 탭·[등록]·[인증하기]·[변경] 전부 같은 인증 화면(A 계열)이다 — 경로가 갈라지면
      발송 횟수 제한이 경로별로 샌다(auth.md 4.4) */
  onPress: () => void;
  onRetry: () => void;
  isRetrying: boolean;
}

interface ActionButtonProps {
  label: string;
  onPress: () => void;
}

function ActionButton({ label, onPress }: ActionButtonProps) {
  return (
    <Pressable
      style={styles.actionButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

/**
 * [이메일] 카드 — 세 상태(미등록·미인증·인증됨)를 같은 카드의 변형으로 구분한다(profile-uiux.md 4.3).
 * 버튼이 여러 개라 카드 단일 포커스의 유일한 예외다(7장) — a11yLabel을 null로 두고 버튼이
 * 개별 포커스를 갖는다. 미인증 배지는 색 + 텍스트이고 스크린리더는 주소 뒤에 이어 읽는다.
 * 인증을 강요하는 팝업·배너는 띄우지 않는다 — 보조 문구 한 줄뿐(강제 지점은 첫 결제, auth.md 4.4).
 */
export default function EmailCard({ state, onPress, onRetry, isRetrying }: EmailCardProps) {
  const hasError = state.kind === 'error';
  const vm = state.kind === 'data' ? state.data : null;
  return (
    <View>
      <ProfileCard
        label={PROFILE_COPY.cardLabels.email}
        onPress={onPress}
        a11yLabel={null}
        hasError={hasError}
        onRetry={onRetry}
        isRetrying={isRetrying}
      >
        {vm ? (
          <View style={styles.content}>
            {vm.status === 'unregistered' ? (
              <>
                <Text style={styles.placeholder}>{PROFILE_COPY.email.unregistered}</Text>
                <ActionButton label={PROFILE_COPY.email.register} onPress={onPress} />
              </>
            ) : (
              <>
                <View
                  style={styles.addressBlock}
                  accessibilityLabel={
                    vm.status === 'unverified' && vm.email !== null
                      ? PROFILE_COPY.email.unverifiedValueA11y(vm.email)
                      : (vm.email ?? undefined)
                  }
                >
                  <Text style={styles.address}>{vm.email}</Text>
                  {vm.status === 'unverified' ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{PROFILE_COPY.email.unverifiedBadge}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.actions}>
                  {vm.status === 'unverified' ? (
                    <ActionButton label={PROFILE_COPY.email.verify} onPress={onPress} />
                  ) : null}
                  <ActionButton label={PROFILE_COPY.email.change} onPress={onPress} />
                </View>
              </>
            )}
          </View>
        ) : null}
      </ProfileCard>
      {vm !== null && vm.status !== 'verified' ? (
        <Text style={styles.helper}>{PROFILE_COPY.email.helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    // 동적 텍스트 200% — 주소가 길어지면 말줄임 대신 줄바꿈으로 접는다(profile-uiux.md 7장)
    flexWrap: 'wrap',
  },
  placeholder: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  addressBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  address: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    flexShrink: 1,
  },
  badge: {
    backgroundColor: theme.color.danger,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs / 2,
  },
  badgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  actionButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  actionText: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  helper: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
});
