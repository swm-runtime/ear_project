import type { TextStyle } from 'react-native';

/** iOS·웹은 플랫폼 글꼴을 그대로 사용한다. Android 구현은 별도 파일에서 선택된다. */
export function useAndroidBoldFont(): TextStyle | undefined {
  return undefined;
}
