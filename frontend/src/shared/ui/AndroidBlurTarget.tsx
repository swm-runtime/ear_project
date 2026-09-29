import { BlurTargetView } from 'expo-blur';
import type { ReactNode, RefObject } from 'react';
import { Platform, StyleSheet, type View } from 'react-native';

interface AndroidBlurTargetProps {
  targetRef: RefObject<View | null>;
  children: ReactNode;
}

/**
 * Android 블러가 **흐릴 대상** — expo-blur 57 은 Android 에서 BlurView 가 `blurTarget` 으로 이 뷰를 가리켜야 진짜 블러가
 * 걸린다(없으면 반투명 막만). 떠 있는 바(BlurView)는 반드시 이 뒤에 선언한다 — BlurView 는 붙는 순간 한 번만 대상을 읽는다
 * (PM 2026-09-29 15:50 설정 화면에서 확인). 다른 플랫폼에서는 자식을 그대로 둔다(레이아웃 변화 없음)
 */
export default function AndroidBlurTarget({ targetRef, children }: AndroidBlurTargetProps) {
  if (Platform.OS !== 'android') return <>{children}</>;
  return (
    <BlurTargetView ref={targetRef} style={styles.fill}>
      {children}
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
