import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
} from 'react-native';

import { theme } from '@/shared/theme';
import CheckIcon from '@/shared/ui/CheckIcon';
import SegmentedControl from '@/shared/ui/SegmentedControl';

import {
  HAS_SYSTEM_SEGMENTED_CONTROL,
  SystemSegmentedControl,
  type SystemSegmentedControlChangeEvent,
} from '../../../../modules/system-segmented-control/src';
import { EXPLORE_COPY } from '../explore.copy';
import type { ExplorePeriod } from '../explore.types';

/** JS 세그먼트(Android·옛 빌드)의 칸 높이 — 캡슐 전체 32, 안쪽 3 을 빼면 26 */
const FALLBACK_SEGMENT_HEIGHT = 26;
/** 시스템 컨트롤 크기 — UISegmentedControl 은 Yoga 에 크기를 알리지 않는다. 높이 32 는 iOS 기본, 칸 52×3 */
/**
 * Android 는 Material 3 Expressive Connected toggle group(같은 모듈) — 작은 버튼 높이 40, 칸은 두 글자 + 좌우 16 + 2dp 틈.
 * 네이티브 뷰는 Yoga 에 크기를 알리지 않아 여기서 준다
 */
const IS_ANDROID = Platform.OS === 'android';
const SYSTEM_HEIGHT = IS_ANDROID ? 40 : 32;
const SYSTEM_SEGMENT_WIDTH = IS_ANDROID ? 64 : 52;

interface PopularPeriodToggleProps {
  /** 선택 상태의 근거는 서버 응답의 period다 — 클라이언트 기본값이 없다(uiux 4.10) */
  selected: ExplorePeriod;
  onSelect: (period: ExplorePeriod) => void;
  /** 전환 중 중복 탭 차단(uiux 4.10) */
  disabled: boolean;
}

/** 라벨은 화면 문구, 값은 전송값 — 순서는 uiux 4.10의 "주간 · 월간 · 전체"다 */
const PERIODS: ExplorePeriod[] = ['week', 'month', 'all'];
const LABELS = PERIODS.map((value) => EXPLORE_COPY.popular.periodLabels[value]);
const OPTIONS = PERIODS.map((value, index) => ({ value, label: LABELS[index] }));

/**
 * E13 인기 구간 토글 — 인기 섹션 제목 줄에만 붙는 3택 1. 확정 구간이 없어도 세 구간 모두 항상 고를 수 있다 —
 * 탭을 숨기거나 비활성화하지 않는다(explore.md 4.1-1 · uiux 8장).
 *
 * iOS 는 **시스템 UISegmentedControl 그대로**(`modules/system-segmented-control`, PM 2026-09-26 02:19 "iOS 26 기본
 * 토글로") — iOS 26 에서는 OS 가 그리는 유리 선택바다. JS 재현(`SegmentedControl` 의 `system`·`modern`)은 실기기에서
 * "옛날 것 같다"는 평을 받았다. Android·모듈 없는 빌드는 종전 캡슐 선택바(`modern`)로 내려간다.
 */
export default function PopularPeriodToggle({
  selected,
  onSelect,
  disabled,
}: PopularPeriodToggleProps) {
  if (HAS_SYSTEM_SEGMENTED_CONTROL) {
    return <SystemPeriodToggle selected={selected} onSelect={onSelect} disabled={disabled} />;
  }
  // 네이티브 모듈이 없는 옛 Android 빌드 — JS 로 그린 M3 세그먼트 버튼으로 내려간다
  if (Platform.OS === 'android') {
    return <MaterialPeriodToggle selected={selected} onSelect={onSelect} disabled={disabled} />;
  }
  return (
    <SegmentedControl
      options={OPTIONS}
      value={selected}
      onChange={onSelect}
      disabled={disabled}
      accessibilityLabel={EXPLORE_COPY.popular.toggleA11y}
      appearance="modern"
      segmentHeight={FALLBACK_SEGMENT_HEIGHT}
    />
  );
}

/**
 * 시스템 컨트롤은 탭하는 순간 스스로 선택 칸을 옮긴다(그게 iOS 문법). 선택의 기준은 여전히 `selected`(서버 응답)라,
 * 비활성 중 탭이거나 전환이 실패해 `selected` 가 안 바뀌면 컨트롤이 보여 주는 칸과 어긋난다 — 그때 `key` 로 다시
 * 그려 `selected` 로 되돌린다(uiux 4.10 "선택 상태를 직전 구간으로 되돌린다"). `enabled` 를 내리지 않는 이유:
 * 시스템은 비활성을 흐리게 그려서, 전환마다 잠깐 흐려졌다 돌아오는 깜빡임이 된다
 */
function SystemPeriodToggle({ selected, onSelect, disabled }: PopularPeriodToggleProps) {
  /** 컨트롤이 지금 보여 주는 값 — 탭 이벤트로 갱신한다 */
  const shownRef = useRef<ExplorePeriod>(selected);
  const [resyncKey, setResyncKey] = useState(0);

  useEffect(() => {
    if (!disabled && shownRef.current !== selected) {
      shownRef.current = selected;
      setResyncKey((key) => key + 1);
    }
  }, [disabled, selected]);

  const handleChange = (event: NativeSyntheticEvent<SystemSegmentedControlChangeEvent>) => {
    const next = PERIODS[event.nativeEvent.selectedIndex];
    if (!next) return;
    if (disabled || next === selected) {
      // 중복 탭 차단 — 컨트롤이 먼저 움직였으니 되돌린다
      shownRef.current = selected;
      setResyncKey((key) => key + 1);
      return;
    }
    shownRef.current = next;
    onSelect(next);
  };

  // HAS_SYSTEM_SEGMENTED_CONTROL 이 true 면 항상 있다 — 타입 좁히기용
  if (!SystemSegmentedControl) return null;
  return (
    <SystemSegmentedControl
      key={resyncKey}
      segments={LABELS}
      selectedIndex={PERIODS.indexOf(selected)}
      onChange={handleChange}
      accessibilityLabel={EXPLORE_COPY.popular.toggleA11y}
      style={styles.system}
    />
  );
}

const styles = StyleSheet.create({
  system: {
    width: SYSTEM_SEGMENT_WIDTH * PERIODS.length,
    height: SYSTEM_HEIGHT,
  },
});

/*
 * ── Android 폴백: Material 3 Segmented button(PM 2026-09-29 16:29) — 네이티브 모듈(Expressive Connected toggle group)이
 * 없는 옛 빌드에서만 쓴다(16:37 "재현하지 말고 그대로 사용해" → 모듈이 기본) ──
 * iOS 가 시스템 UISegmentedControl 을 쓰듯 Android 는 Material 3 의 세그먼트 버튼 문법을 따른다 — 테두리 알약(1dp outline,
 * 높이 40) 안에 같은 폭의 칸, 칸 사이 1dp 구분선, 선택 칸은 컨테이너 색으로 채우고 라벨 앞에 체크(18dp), 누르면 물결(ripple).
 * 색은 M3 기준 역할을 이 앱의 무채색으로 옮겼다(secondaryContainer → 중립 회색). 선택 기준은 여전히 `selected`(서버 응답)이고
 * 전환 중 탭은 무시한다 — 흐리게 그리지 않는다(iOS 와 같은 이유: 전환마다 깜빡인다)
 */
const MD_HEIGHT = 40;
/** 칸 폭 — 체크 18 + 틈 4 + 두 글자(14sp) + 좌우 8. 360dp 폰에서 제목 "인기 콘텐츠" 옆에 한 줄로 서는 폭 */
const MD_SEGMENT_WIDTH = 68;
const MD_CHECK_SIZE = 18;
const MD_OUTLINE = '#79747E';
const MD_SELECTED_CONTAINER = '#E4E4E9';
const MD_ON_SURFACE = '#1D1B20';
const MD_RIPPLE = 'rgba(29, 27, 32, 0.12)';

function MaterialPeriodToggle({ selected, onSelect, disabled }: PopularPeriodToggleProps) {
  return (
    <View
      style={materialStyles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel={EXPLORE_COPY.popular.toggleA11y}
    >
      {OPTIONS.map((option, index) => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            style={[
              materialStyles.segment,
              index > 0 && materialStyles.segmentDivider,
              isSelected && materialStyles.segmentSelected,
            ]}
            android_ripple={{ color: MD_RIPPLE }}
            onPress={() => {
              if (disabled || isSelected) return;
              onSelect(option.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={option.label}
          >
            {isSelected ? (
              <CheckIcon size={MD_CHECK_SIZE} color={MD_ON_SURFACE} strokeWidth={2} />
            ) : null}
            <Text style={materialStyles.label} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const materialStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: MD_HEIGHT,
    borderRadius: MD_HEIGHT / 2,
    borderWidth: 1,
    borderColor: MD_OUTLINE,
    // 물결·선택 면이 알약 밖으로 새지 않게
    overflow: 'hidden',
  },
  segment: {
    width: MD_SEGMENT_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // M3 기본 틈은 8 — 좁은 제목 줄에 맞춰 4
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  segmentDivider: {
    borderLeftWidth: 1,
    borderLeftColor: MD_OUTLINE,
  },
  segmentSelected: {
    backgroundColor: MD_SELECTED_CONTAINER,
  },
  // M3 label-large — 14sp · medium · 0.1 자간
  label: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.1,
    color: MD_ON_SURFACE,
  },
});
