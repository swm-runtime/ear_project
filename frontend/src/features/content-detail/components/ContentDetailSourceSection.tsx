import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { CONTENT_DETAIL_COPY } from '../content-detail.copy';
import type { ContentDetailContent, ContentDetailSource } from '../content-detail.types';

interface ContentDetailSourceSectionProps {
  content: ContentDetailContent;
  onSourceLinkPress: () => void;
  onSourceItemPress: (source: ContentDetailSource) => void;
}

/**
 * 출처 영역 — origin 두 갈래(content-detail.md 4.3). 분류명("파트너"·"AI 생성")은 라벨로
 * 노출하지 않는다 — 분류는 구성 차이로만 드러난다(uiux 8장 금지).
 *
 * partner(CD1): 저자 · 제공 · [원문 보기] — 셋 다 필수라 항상 표시된다.
 * ai_generated(CD2): 참고한 소스 전수 나열 — 제목·저자만 표시하고 URL 문자열은 노출하지
 * 않는다. 링크 있는 소스만 항목 자체가 탭 대상이다("외 N건" 생략·접기·길이 제한 금지).
 */
export default function ContentDetailSourceSection({
  content,
  onSourceLinkPress,
  onSourceItemPress,
}: ContentDetailSourceSectionProps) {
  if (content.origin === 'partner') {
    return (
      <View style={styles.root}>
        <Text style={styles.sectionLabel}>{CONTENT_DETAIL_COPY.source.partnerLabel}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{CONTENT_DETAIL_COPY.source.author}</Text>
          <Text style={styles.rowValue}>{content.authorName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{CONTENT_DETAIL_COPY.source.provider}</Text>
          <Text style={styles.rowValue}>{content.sourceName}</Text>
        </View>
        {/* 더보기 시트의 [원문 보기]와 같은 동작 — 인앱 브라우저 + 클릭 기록(4.3) */}
        <Pressable
          style={styles.sourceLink}
          onPress={onSourceLinkPress}
          accessibilityRole="link"
          accessibilityLabel={CONTENT_DETAIL_COPY.source.sourceLink}
          accessibilityHint={CONTENT_DETAIL_COPY.source.linkA11yHint}
        >
          <Text style={styles.sourceLinkLabel}>{CONTENT_DETAIL_COPY.source.sourceLink}</Text>
          <Text style={styles.linkGlyph} accessibilityElementsHidden>
            ↗
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.sectionLabel}>{CONTENT_DETAIL_COPY.source.aiLabel}</Text>
      {(content.sources ?? []).map((source, index) => {
        const body = (
          <View style={styles.sourceItemText}>
            {/* 소스 제목은 여러 줄을 허용한다(uiux 7장 — 동적 텍스트 200%) */}
            <Text style={styles.sourceItemTitle}>{source.title}</Text>
            {/* 저자 없는 소스는 제목 한 줄만 — "저자 없음"으로 채우지 않는다(4.3-1) */}
            {source.author !== null ? (
              <Text style={styles.sourceItemAuthor}>{source.author}</Text>
            ) : null}
          </View>
        );
        // 링크 없는 소스는 탭 대상이 아니다 — 비활성 스타일 없이 정적 텍스트로만 둔다(uiux 4.6)
        if (source.url === null) {
          return (
            <View key={`${source.title}-${index}`} style={styles.sourceItem}>
              {body}
            </View>
          );
        }
        return (
          <Pressable
            key={`${source.title}-${index}`}
            style={styles.sourceItem}
            onPress={() => onSourceItemPress(source)}
            accessibilityRole="link"
            accessibilityLabel={[source.title, source.author].filter(Boolean).join(', ')}
            accessibilityHint={CONTENT_DETAIL_COPY.source.linkA11yHint}
          >
            {body}
            <Text style={styles.linkGlyph} accessibilityElementsHidden>
              ↗
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  rowLabel: {
    minWidth: 56,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  rowValue: {
    flex: 1,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: theme.touchTarget.minHeight,
  },
  sourceLinkLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
    textDecorationLine: 'underline',
  },
  linkGlyph: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    // 행 전체가 히트 영역이다(uiux 7장 — 터치 타깃 44pt)
    minHeight: theme.touchTarget.minHeight,
    paddingVertical: theme.spacing.xs,
  },
  sourceItemText: {
    flex: 1,
    gap: 2,
  },
  sourceItemTitle: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  sourceItemAuthor: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
});
