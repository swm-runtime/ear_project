import { useRoute, type RouteProp } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import FullScreenError from '@/shared/ui/FullScreenError';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import { hasPolicyDocument } from '../auth.constants';
import { AUTH_COPY } from '../auth.copy';
import type { MarketChangeParams } from '../auth.types';
import ConsentItem from '../components/ConsentItem';
import { useMarketChangeScreen } from '../hooks/useMarketChangeScreen';

const COPY = AUTH_COPY.marketChange;
const BACK_ICON_SIZE = 20;

/**
 * 설정 › 콘텐츠 언어(시장) 전환(KAN-228 — global-api.md 4.11). **무엇이 바뀌는지 → 새 언어의 필수 동의 → [바꾸기]** 를
 * 한 화면에 둔다 — 확인 팝업과 동의 화면을 나누면 같은 결정을 두 번 묻는다(FE 결정). 막힘(하루 1번·준비 안 된 언어)이면
 * 동의 대신 안내와 [닫기]만 그린다. 동의 목록 모양은 A20 재동의와 같다(같은 `ConsentItem`).
 *
 * 앱바를 화면이 직접 그린다 — 설정(MainStack)과 재온보딩 [되돌리기](OnboardingStack) 두 스택에 같은 모양으로 뜬다.
 */
export default function MarketChangeScreen() {
  const { params } = useRoute<RouteProp<{ MarketChange: MarketChangeParams }, 'MarketChange'>>();
  const screen = useMarketChangeScreen(params.targetLanguage);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.appBar}>
        <GlassIconButton onPress={screen.goBack} accessibilityLabel={COPY.backA11y}>
          <ChevronIcon direction="left" size={BACK_ICON_SIZE} color={theme.color.textPrimary} />
        </GlassIconButton>
        <Text style={styles.appBarTitle} accessibilityRole="header">
          {COPY.appBarTitle}
        </Text>
        <View style={styles.appBarSpacer} />
      </View>

      {screen.isError ? (
        <FullScreenError
          title={COPY.loadFailedTitle}
          description={COPY.loadFailedDescription}
          retryLabel={COPY.retry}
          isRetrying={screen.isRefetching}
          onRetry={screen.retry}
        />
      ) : screen.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.color.primary} />
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            alwaysBounceVertical={false}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>{COPY.title(screen.targetLanguageName)}</Text>

            {screen.blocked !== null ? (
              <View style={styles.blocked} accessibilityLiveRegion="polite">
                <Text style={styles.blockedTitle}>{COPY.blocked[screen.blocked.reason].title}</Text>
                <Text style={styles.description}>
                  {screen.blocked.reason === 'cooldown'
                    ? COPY.blocked.cooldown.description(screen.blockedHours)
                    : COPY.blocked.market_unavailable.description}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.points}>
                  {COPY.points.map((point) => (
                    <View key={point} style={styles.pointRow}>
                      <Text style={styles.pointBullet}>•</Text>
                      <Text style={styles.pointText}>{point}</Text>
                    </View>
                  ))}
                </View>

                {screen.items.length > 0 ? (
                  <View style={styles.list}>
                    <Text style={styles.consentTitle}>{COPY.consentTitle}</Text>
                    <Pressable
                      style={styles.agreeAll}
                      onPress={screen.toggleAll}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: screen.isAllChecked }}
                      accessibilityLabel={AUTH_COPY.consent.agreeAll}
                    >
                      <View style={[styles.circle, screen.isAllChecked && styles.circleChecked]}>
                        {screen.isAllChecked ? (
                          <CheckIcon size={15} color={theme.color.onPrimary} />
                        ) : null}
                      </View>
                      <Text style={styles.agreeAllLabel}>{AUTH_COPY.consent.agreeAll}</Text>
                    </Pressable>

                    <View style={styles.divider} />

                    {screen.items.map((item) => (
                      <ConsentItem
                        key={item.consentType}
                        label={item.label}
                        isRequired={item.isRequired}
                        isChecked={item.isChecked}
                        description={item.description}
                        onToggle={() => screen.toggleConsent(item.consentType)}
                        onViewPress={
                          hasPolicyDocument(item.consentType)
                            ? () => screen.handleViewPress(item.consentType)
                            : undefined
                        }
                      />
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {screen.blocked !== null ? (
            <Pressable
              style={[pillButton.base, pillButton.primary, styles.submit]}
              onPress={screen.goBack}
              accessibilityRole="button"
              accessibilityLabel={COPY.close}
            >
              <Text style={styles.submitLabel}>{COPY.close}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[
                pillButton.base,
                pillButton.primary,
                styles.submit,
                !screen.canSubmit && !screen.isSubmitting && styles.submitDisabled,
              ]}
              disabled={!screen.canSubmit}
              onPress={() => void screen.handleSubmit()}
              accessibilityRole="button"
              accessibilityLabel={COPY.submit}
              accessibilityState={{ disabled: !screen.canSubmit, busy: screen.isSubmitting }}
            >
              {screen.isSubmitting ? (
                <ActivityIndicator color={theme.color.onPrimary} />
              ) : (
                <Text style={styles.submitLabel}>{COPY.submit}</Text>
              )}
            </Pressable>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  /** 타이틀을 가운데 두기 위한 뒤로가기 대칭 여백 */
  appBarSpacer: {
    minWidth: HEADER_CONTROL_HEIGHT,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl * 1.3,
  },
  description: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.md * 1.5,
  },
  points: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  pointRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  pointBullet: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.md * 1.5,
  },
  pointText: {
    flex: 1,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.md * 1.5,
  },
  blocked: {
    marginTop: theme.spacing.lg,
  },
  blockedTitle: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  list: {
    marginTop: theme.spacing.xl,
  },
  consentTitle: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  agreeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  agreeAllLabel: {
    flexShrink: 1,
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.border,
    marginVertical: theme.spacing.sm,
  },
  // 크기만 — 모양·색은 공용 알약(pillButton)
  submit: {
    minHeight: 56,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  submitDisabled: {
    backgroundColor: theme.color.border,
  },
  submitLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
});
