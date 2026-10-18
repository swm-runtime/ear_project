import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { Text } from '@/shared/ui/Typography';

import { AUTH_COPY } from '../auth.copy';

/** 동의 원의 지름 — 전체 동의(24)보다 한 치수 작다 */
const CIRCLE_SIZE = 22;

interface ConsentItemProps {
  label: string;
  isRequired: boolean;
  isChecked: boolean;
  /** 마케팅 항목의 수신 내용 한 줄 고지(auth-uiux.md 4.3) */
  description: string | null;
  onToggle: () => void;
  /** 없으면 [보기] 셰브론을 그리지 않는다 — 마케팅처럼 열람 문서가 없는 항목용 */
  onViewPress?: () => void;
}

/**
 * 동의 항목 행 — 빈 원형 체크(체크 시 primary 채움) + 라벨 + [보기] 셰브론(스타벅스 결,
 * 시각 개편 2026-09-04). 행 전체(셰브론 제외)가 탭 영역이고 낭독은 checkbox 시맨틱이다.
 */
export default function ConsentItem({
  label,
  isRequired,
  isChecked,
  description,
  onToggle,
  onViewPress,
}: ConsentItemProps) {
  const tag = isRequired ? AUTH_COPY.consent.requiredTag : AUTH_COPY.consent.optionalTag;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.checkArea}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isChecked }}
        accessibilityLabel={`${label} ${tag}`}
      >
        <View style={styles.content}>
          {/* 원 자리 — 높이를 라벨 첫 줄과 같게 재는 투명 한 줄(받침) 위에 원을 가운데 얹는다. 글자 크기 설정이
              바뀌어도 원이 첫 줄 가운데에 선다(줄 높이를 숫자로 박지 않으므로 — 아래 label 주석) */}
          <View style={styles.circleSlot}>
            <Text
              style={[styles.label, styles.lineStrut]}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              testID="consent-line-strut"
            >
              {' '}
            </Text>
            <View style={[styles.circle, isChecked && styles.circleChecked]}>
              {isChecked ? <CheckIcon size={13} color={theme.color.onPrimary} /> : null}
            </View>
          </View>
          <View style={styles.labelArea}>
            <Text style={styles.label} testID="consent-label">
              {label} <Text style={styles.tag}>{tag}</Text>
            </Text>
            {description !== null ? <Text style={styles.description}>{description}</Text> : null}
          </View>
        </View>
      </Pressable>
      {onViewPress ? (
        <Pressable
          style={styles.viewButton}
          onPress={onViewPress}
          hitSlop={theme.spacing.sm}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${AUTH_COPY.consent.view}`}
        >
          <ChevronIcon direction="right" size={18} color={theme.color.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight,
  },
  checkArea: {
    flex: 1,
    flexDirection: 'row',
    // 한 줄 항목은 행 가운데(셰브론과 같은 높이)에 선다. 여러 줄이면 content 가 행을 채워 위에서부터 놓인다
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight,
    paddingVertical: theme.spacing.sm + 3,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    // 원(원 자리)은 첫 줄에 맞춘다 — 여러 줄 항목에서 원이 줄 사이에 뜨지 않게(auth-uiux.md 4.3)
    alignItems: 'flex-start',
  },
  /** 원 자리 — 높이는 받침 글자(라벨 첫 줄과 같은 글꼴·크기의 투명 한 줄)가 정하고, 원은 그 가운데에 겹친다 */
  circleSlot: {
    width: CIRCLE_SIZE,
    justifyContent: 'center',
    marginRight: theme.spacing.sm + theme.spacing.xs,
  },
  /** 받침 글자 — 보이지도 읽히지도 않는다. 원 자리의 높이를 첫 줄 높이로 만드는 데만 쓴다 */
  lineStrut: {
    opacity: 0,
  },
  /** 빈 원형 체크 — 체크 시 primary 채움(전체 동의와 같은 문법, 한 치수 작게) */
  circle: {
    // 받침 줄의 세로 가운데에 겹친다. 기본 글자 크기에서 첫 줄(약 19pt)보다 원(22)이 커 위아래로 1~2pt 넘치지만
    // 행의 위아래 여백(11) 안이라 잘리지 않는다
    position: 'absolute',
    top: '50%',
    left: 0,
    marginTop: -CIRCLE_SIZE / 2,
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleChecked: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  labelArea: {
    flex: 1,
  },
  /*
   * 라벨에 **고정 줄 높이(lineHeight)를 주지 않는다**(2026-10-19 KAN-216 — 영어 국외 이전 동의가 iOS 큰 글자에서
   * 6줄째 "...in the Privac"에서 잘리고 "(Required)"가 사라졌다). RN iOS 는 lineHeight 를 글자 크기 배수만큼 키워
   * 모든 줄에 최소=최대 줄 높이로 박는데(22 × 1.235 = 27.17 처럼 소수), 이 경로에서 측정한 상자보다 실제 줄이 길어지면
   * 마지막 줄이 들어가지 못한다. 그런데 numberOfLines 가 없을 때 RN iOS 는 글자 상자의 끝 줄을 단어 접기 대신
   * 잘라내기(NSLineBreakByClipping)로 그려서 — 남은 글이 그 줄에 이어 붙다가 오른쪽 끝에서 글자 중간이 잘린다.
   * 줄 높이를 글꼴의 자연 높이에 맡기면 이 경로를 타지 않는다. 그래서 원 정렬도 줄 높이 숫자 대신 받침 글자로 한다
   */
  label: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  tag: {
    color: theme.color.textSecondary,
    fontSize: theme.font.size.sm,
  },
  description: {
    marginTop: theme.spacing.xs,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  viewButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
