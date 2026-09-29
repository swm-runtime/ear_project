import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, type NativeSyntheticEvent } from 'react-native';

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
const IS_ANDROID = Platform.OS === 'android';
const SYSTEM_HEIGHT = 32;
const SYSTEM_SEGMENT_WIDTH = 52;
/**
 * Android 토글 외곽 높이는 32dp(칸 28 + 안쪽 2×2). 제목 행의 중앙 정렬 래퍼 안에 둔다.
 * 누르는 영역은 SegmentedControl 이 위아래 hitSlop 으로 44 를 채운다
 */
const IOS26_SEGMENT_HEIGHT = 28;
const IOS_SEGMENT_WIDTH = SYSTEM_SEGMENT_WIDTH;

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
 * "옛날 것 같다"는 평을 받았다. 모듈 없는 옛 iOS 빌드는 종전 캡슐 선택바(`modern`)로 내려간다.
 *
 * Android 는 **iOS 26 시스템 토글 모양의 JS 토글**(`SegmentedControl` `ios26` — 캡슐 트랙 + 떠 있는 흰 캡슐,
 * 외곽 높이 32 · 칸 폭 52). Material 3 Segmented button(#980)·Expressive 네이티브 토글(#981)은 PM 이 "구리다"(2026-09-29 17:10)고 해
 * 걷었다 — 네이티브 모듈의 Android 쪽은 빌드에 남아 있지만 쓰지 않는다.
 */
export default function PopularPeriodToggle({
  selected,
  onSelect,
  disabled,
}: PopularPeriodToggleProps) {
  // Android 는 Material 네이티브 토글(모듈에 남아 있다)을 쓰지 않는다 — iOS 26 모양의 JS 토글(PM 2026-09-29 17:10 "안드로이드
  // 토글 구리다, iOS 거 참고해서"). 시스템 컨트롤은 iOS 만
  if (HAS_SYSTEM_SEGMENTED_CONTROL && !IS_ANDROID) {
    return <SystemPeriodToggle selected={selected} onSelect={onSelect} disabled={disabled} />;
  }
  return (
    <SegmentedControl
      options={OPTIONS}
      value={selected}
      onChange={onSelect}
      disabled={disabled}
      accessibilityLabel={EXPLORE_COPY.popular.toggleA11y}
      appearance={IS_ANDROID ? 'ios26' : 'modern'}
      segmentHeight={IS_ANDROID ? IOS26_SEGMENT_HEIGHT : FALLBACK_SEGMENT_HEIGHT}
      segmentWidth={IS_ANDROID ? IOS_SEGMENT_WIDTH : undefined}
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
