import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import PersonIcon from '@/shared/ui/PersonIcon';

import { ProviderIcon } from '@/features/auth';
import type { SocialProvider } from '@/features/auth';

import type { PlanCardVM, SectionState } from '../hooks/useProfileScreen';
import { PROFILE_COPY } from '../profile.copy';

interface ProfileHeaderProps {
  /** null = 제공자가 주지 않은 계정. 카카오 닉네임은 선택 동의라 실제로 흔하다 */
  nickname: string | null;
  provider: SocialProvider;
  /** null = 제공자가 주지 않았거나 미등록 */
  email: string | null;
  /** 미인증이면 배지를 붙인다 — 인증된 것과 같은 모양으로 그리지 않는다(auth-uiux.md 8장) */
  isEmailVerified: boolean;
  /** 이메일 줄이 등록·인증·변경의 프로필 쪽 진입점이다(profile.md 4.3 — 설정 경로와 같은 화면) */
  onEmailPress: () => void;
  /** 플랜은 목록 항목이 아니라 "내가 누구인지"의 일부라 여기 붙인다. null이면 조회 중·실패 */
  plan: SectionState<PlanCardVM> | null;
  onPlanPress: () => void;
}

// 가로 배치라 세로로 쌓을 때보다 작게 잡는다 — 88이면 옆의 두 줄(닉네임·이메일)보다 훨씬 커져 균형이 깨진다
const AVATAR_SIZE = 64;
const VERTICAL_PADDING = theme.spacing.lg;

/**
 * 아바타 줄의 높이(플랜 줄 제외). 설정 아이콘은 헤더 밖(화면)이 그리면서 이 줄의 세로
 * 가운데에 맞춰야 하는데, 조회 실패·로딩 중에는 헤더가 없어 높이를 잴 수 없다 —
 * 값을 여기서 내보내 한 곳에서 관리한다.
 */
export const PROFILE_IDENTITY_ROW_HEIGHT = VERTICAL_PADDING + AVATAR_SIZE;
const PROVIDER_BADGE_SIZE = 24;
const PROVIDER_ICON_SIZE = 13;
/** 닉네임이 없을 때 아바타를 채우는 사람 아이콘 */
const AVATAR_ICON_SIZE = 36;

/**
 * 헤더 — 프로필 사진 옆에 닉네임·이메일을 세로로 쌓아 가로로 배치한다(profile-uiux.md 4.1).
 *
 * **프로필 사진 원본이 아직 없다.** 서버 응답(`ProfileUserDto`)에도 `users` 테이블에도
 * 이미지 필드가 없어 **닉네임 첫 글자로, 닉네임도 없으면 사람 아이콘으로** 대신 그린다.
 * 제공자에게 이미지를 받아오려면 동의항목·컬럼·API 필드가 함께 필요하다 —
 * 그때 이 컴포넌트만 교체한다.
 *
 * 제공자는 아바타 우하단 배지로 붙인다. 명세 4.1이 요구하는 표시를 유지하면서
 * 닉네임·이메일의 세로 정렬을 흐트러뜨리지 않는다.
 *
 * 닉네임·아바타는 표시만 한다(닉네임 편집·계정 통합은 MVP 비범위). 이메일 줄만
 * 진입점이다 — 프로필의 이메일 등록·인증 진입은 profile.md 4.3이 소유한다.
 */
/** 상태별 문구 — 서버가 정규화한 4분기를 그대로 그린다(재판정 금지) */
const planText = (vm: PlanCardVM): string => {
  switch (vm.kind) {
    case 'free':
      return PROFILE_COPY.plan.free(vm.dailyPlayLimit);
    case 'subscribed':
      return vm.renewsAt === null
        ? vm.planName
        : `${vm.planName} · ${PROFILE_COPY.plan.renewsAt(vm.renewsAt)}`;
    case 'cancelScheduled':
      return vm.expiresAt === null
        ? vm.planName
        : `${vm.planName} · ${PROFILE_COPY.plan.cancelScheduled(vm.expiresAt)}`;
    case 'grace':
      return `${vm.planName} · ${PROFILE_COPY.plan.paymentIssue}`;
  }
};

export default function ProfileHeader({
  nickname,
  provider,
  email,
  isEmailVerified,
  onEmailPress,
  plan,
  onPlanPress,
}: ProfileHeaderProps) {
  const trimmed = nickname?.trim() ?? '';
  const displayName = trimmed || PROFILE_COPY.header.noNickname;
  /**
   * 닉네임이 없으면 이니셜을 만들지 않는다 — 플레이스홀더("이름 없음")에서 글자를 떼면
   * 아바타에 "이"가 박혀 **사용자가 자기 이름으로 오해한다.** 없을 땐 사람 아이콘을 둔다.
   * 이모지·기호 닉네임에서도 한 글자만 안전하게 떼어낸다
   */
  const initial = trimmed === '' ? null : ([...trimmed][0] ?? null);

  return (
    <View>
      <View style={styles.identityRow}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
            {initial !== null ? (
              <Text style={styles.initial}>{initial}</Text>
            ) : (
              <PersonIcon size={AVATAR_ICON_SIZE} color={theme.color.textSecondary} filled />
            )}
          </View>
          <View
            style={styles.providerBadge}
            accessibilityLabel={PROFILE_COPY.header.providerA11y(provider)}
          >
            <ProviderIcon
              provider={provider}
              size={PROVIDER_ICON_SIZE}
              color={theme.color.textPrimary}
            />
          </View>
        </View>

        <View style={styles.names}>
          <Text style={styles.nickname} numberOfLines={1}>
            {displayName}
          </Text>
          {/* 이메일 줄 — 등록·인증·변경의 프로필 진입점(profile.md 4.3). 줄 자체가 작아
              hitSlop으로 터치 타깃 44pt를 채운다(profile-uiux.md 7장) */}
          <Pressable
            style={styles.emailRow}
            onPress={onEmailPress}
            hitSlop={{ top: theme.spacing.sm, bottom: theme.spacing.sm }}
            accessibilityRole="button"
            accessibilityLabel={PROFILE_COPY.cardA11y(
              PROFILE_COPY.cardLabels.email,
              email === null
                ? PROFILE_COPY.header.noEmail
                : isEmailVerified
                  ? email
                  : PROFILE_COPY.email.unverifiedValueA11y(email),
              PROFILE_COPY.destinations.email,
            )}
          >
            <Text style={styles.email} numberOfLines={1}>
              {email ?? PROFILE_COPY.header.noEmail}
            </Text>
            {/* 미인증 배지 — 색 + 텍스트. 인증된 것과 같은 모양 금지(auth-uiux.md 8장) */}
            {email !== null && !isEmailVerified ? (
              <View style={styles.unverifiedBadge}>
                <Text style={styles.unverifiedBadgeText}>
                  {PROFILE_COPY.email.unverifiedBadge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/*
        플랜 — 카드로 따로 세우지 않고 정체 블록에 붙인다. "무료 · 하루 2편"은 목록 항목이
        아니라 내가 어떤 사용자인지의 일부다. 무료 사용자에게는 유일한 전환 지점이므로
        진입 유도 칩을 함께 둔다(칩과 줄 전체가 같은 목적지다).
      */}
      {plan === null ? null : plan.kind === 'error' ? (
        <View style={styles.planRow}>
          <Text style={styles.planMuted}>{PROFILE_COPY.cardError}</Text>
        </View>
      ) : (
        <Pressable
          style={styles.planRow}
          onPress={onPlanPress}
          accessibilityRole="button"
          accessibilityLabel={PROFILE_COPY.cardA11y(
            PROFILE_COPY.cardLabels.plan,
            planText(plan.data),
            PROFILE_COPY.destinations.plan,
          )}
        >
          <Text
            style={[styles.planText, plan.data.kind === 'grace' && styles.planDanger]}
            numberOfLines={1}
          >
            {planText(plan.data)}
          </Text>
          {plan.data.kind === 'free' ? (
            <View style={styles.planCta}>
              <Text style={styles.planCtaText}>{PROFILE_COPY.plan.freeAction}</Text>
            </View>
          ) : null}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingLeft: theme.spacing.md,
    // 오른쪽 끝에는 화면이 그리는 설정 아이콘이 얹힌다 — 그만큼 비워 두지 않으면
    // 긴 닉네임·이메일이 아이콘 아래로 파고든다
    paddingRight: theme.touchTarget.minWidth + theme.spacing.sm,
    paddingTop: VERTICAL_PADDING,
  },
  /** 아바타 줄 바로 아래 — 이름 글자와 x를 맞춰 한 블록으로 읽히게 한다 */
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight,
    paddingLeft: theme.spacing.md + 64 + theme.spacing.md,
    paddingRight: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  planText: {
    flexShrink: 1,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  planMuted: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  /** 결제 문제만 경고색 — 해지 예약은 사용자가 내린 결정이지 장애가 아니다 */
  planDanger: {
    color: theme.color.danger,
  },
  planCta: {
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.primary,
    paddingHorizontal: theme.spacing.sm + theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  planCtaText: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
  avatarWrap: {
    // 배지가 아바타 밖으로 나가므로 줄어들지 않게 고정한다
    flexShrink: 0,
  },
  // 긴 이메일이 아바타를 밀어내지 않도록 남는 폭만 쓴다
  names: {
    flex: 1,
    gap: 2,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textSecondary,
  },
  providerBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: PROVIDER_BADGE_SIZE,
    height: PROVIDER_BADGE_SIZE,
    borderRadius: PROVIDER_BADGE_SIZE / 2,
    backgroundColor: theme.color.background,
    // 아바타와 배지가 같은 색일 때 경계가 사라지지 않게 테두리를 둔다
    borderWidth: 2,
    borderColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nickname: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  email: {
    flexShrink: 1,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  unverifiedBadge: {
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.color.danger,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  unverifiedBadgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.danger,
  },
});
