import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import { PlayConfirmDialog } from '@/features/player';

import ContentDetailHeader from '../components/ContentDetailHeader';
import ContentDetailMeta from '../components/ContentDetailMeta';
import ContentDetailSkeleton from '../components/ContentDetailSkeleton';
import ContentDetailSourceSection from '../components/ContentDetailSourceSection';
import { CONTENT_DETAIL_COPY } from '../content-detail.copy';
import { useContentDetailScreen } from '../hooks/useContentDetailScreen';

/**
 * 콘텐츠 상세 화면(CD1~CD4, content-detail.md · content-detail-uiux.md) — 화면은 뷰만 담당하고
 * 로직은 useContentDetailScreen이 소유한다. 진입은 세 화면(라이브러리 L4 · 탐색 E12 · 플레이어
 * PL7) 더보기 시트의 [상세 정보]뿐이고, 하단 탭바 없이 위에 쌓이는 푸시 화면이다(uiux 4.1).
 * 구성: 헤더(썸네일·제목·태그·[재생]·[담기]/[삭제]) / 소개 / ― / 메타 / ― / 출처.
 */
export default function ContentDetailScreen() {
  const screen = useContentDetailScreen();

  const renderBody = () => {
    // 회수·404(CD4) — 상세를 그리지 않고 안내 후 원 화면 복귀한다(훅이 복귀를 소유)
    if (screen.isRedirecting) return null;
    if (screen.isInitialLoading) {
      return screen.showSkeleton ? <ContentDetailSkeleton /> : null;
    }
    if (screen.isFullError) {
      return (
        <FullScreenError
          title={
            screen.isFullErrorNetwork
              ? CONTENT_DETAIL_COPY.error.networkTitle
              : CONTENT_DETAIL_COPY.error.loadFailedTitle
          }
          description={
            screen.isFullErrorNetwork ? undefined : CONTENT_DETAIL_COPY.error.loadFailedDescription
          }
          retryLabel={CONTENT_DETAIL_COPY.error.retry}
          isRetrying={screen.isRetrying}
          onRetry={screen.retry}
        />
      );
    }
    if (!screen.detail) return null;

    const { content } = screen.detail;
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentDetailHeader
          content={content}
          isSaved={screen.detail.libraryItem !== null}
          isActionPending={screen.isActionPending}
          onPlayPress={screen.requestPlay}
          onSavePress={screen.requestSave}
          onDeletePress={screen.requestDelete}
        />

        {/* 소개 — 전문 표시, 접기/펼치기를 두지 않는다(uiux 4.1) */}
        <View style={styles.introBlock}>
          <Text style={styles.sectionLabel}>{CONTENT_DETAIL_COPY.introLabel}</Text>
          <Text style={styles.description}>{content.description}</Text>
        </View>

        {/* 구분선은 두 개다 — 헤더+소개 / 메타 / 출처의 세 영역을 가른다(content-detail.md 4.2) */}
        <View style={styles.divider} />
        <ContentDetailMeta content={content} />
        <View style={styles.divider} />
        <ContentDetailSourceSection
          content={content}
          onSourceLinkPress={screen.openSourceLink}
          onSourceItemPress={screen.openSourceItemLink}
        />
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 앱바는 로딩보다 먼저 그린다(uiux 4.7) — 뒤로가기 + 타이틀(카피 미확정, 6장 TODO) */}
      <View style={styles.appBar}>
        <Pressable
          style={styles.backButton}
          onPress={screen.goBack}
          accessibilityRole="button"
          accessibilityLabel={CONTENT_DETAIL_COPY.backA11y}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appBarTitle} accessibilityRole="header">
          {CONTENT_DETAIL_COPY.appBarTitle}
        </Text>
        <View style={styles.appBarSpacer} />
      </View>

      {renderBody()}

      {/* 재생 확인 팝업 — L3과 완전히 동일하다(uiux 4.2). 이 화면은 여는 지점만 소유한다 */}
      <PlayConfirmDialog
        visible={screen.playConfirm !== null}
        remaining={screen.playConfirm?.remaining ?? 0}
        onConfirm={screen.confirmPlay}
        onCancel={screen.cancelPlayConfirm}
        onSuppressToday={screen.suppressAndPlay}
      />
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
    paddingHorizontal: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  backButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl + 2,
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  appBarSpacer: {
    width: theme.touchTarget.minWidth,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  introBlock: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  sectionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  description: {
    fontSize: theme.font.size.sm,
    lineHeight: theme.font.size.sm * 1.6,
    color: theme.color.textPrimary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.border,
    marginVertical: theme.spacing.lg,
  },
});
