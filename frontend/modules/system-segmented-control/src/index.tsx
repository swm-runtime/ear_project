import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { Platform, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';

export interface SystemSegmentedControlChangeEvent {
  selectedIndex: number;
}

export interface SystemSegmentedControlProps {
  /** 칸 제목 — 순서가 곧 인덱스 */
  segments: string[];
  /** 선택 칸 — 호출부가 정한다. 값이 바뀌면 시스템 컨트롤이 그 칸으로 옮겨간다 */
  selectedIndex: number;
  /** false 면 시스템이 흐리게 그리고 탭을 막는다 */
  enabled?: boolean;
  onChange?: (event: NativeSyntheticEvent<SystemSegmentedControlChangeEvent>) => void;
  accessibilityLabel?: string;
  /** UISegmentedControl 은 Yoga 에 크기를 알리지 않는다 — width·height 를 호출부가 준다(기본 높이 32) */
  style?: StyleProp<ViewStyle>;
}

/**
 * 이 빌드에 시스템 세그먼트 모듈이 들어 있는가 — iOS 는 runtime 11 이상(UISegmentedControl, 2026-09-26), Android 는
 * Material 3 Expressive Connected toggle group 이 들어간 빌드(2026-09-29 — runtime 31 재빌드부터)에서 true.
 * 옛 빌드는 false 라 호출부가 JS 토글로 내려간다 — 그래서 모듈 추가에도 runtime 을 올리지 않았다(새 JS 가 옛 네이티브에서 안 깨진다)
 */
export const HAS_SYSTEM_SEGMENTED_CONTROL: boolean =
  (Platform.OS === 'ios' || Platform.OS === 'android') &&
  requireOptionalNativeModule('SystemSegmentedControl') != null;

/**
 * iOS 기본 `UISegmentedControl`(iOS 26 에서는 시스템 유리 선택바) · Android Material 3 Expressive Connected toggle
 * group. `HAS_SYSTEM_SEGMENTED_CONTROL` 이 false 인
 * 환경에서 렌더하면 안 된다 — 뷰 매니저가 없어 throw 한다
 */
export const SystemSegmentedControl = HAS_SYSTEM_SEGMENTED_CONTROL
  ? requireNativeViewManager<SystemSegmentedControlProps>('SystemSegmentedControl')
  : null;
