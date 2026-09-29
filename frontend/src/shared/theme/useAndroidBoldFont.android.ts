import { useFonts } from 'expo-font';
import type { TextStyle } from 'react-native';

const fonts = {
  'Pretendard-Bold': require('../../../assets/fonts/Pretendard-Bold.otf'),
};
// 굵기 700 파일 자체를 사용하므로 Android의 합성 볼드를 추가하지 않는다.
const boldStyle: TextStyle = { fontFamily: 'Pretendard-Bold', fontWeight: 'normal' };

/** 앱 진입 때 미리 로드한다. 로딩 중·실패 시 기존 시스템 글꼴로 표시한다. */
export function useAndroidBoldFont(): TextStyle | undefined {
  const [loaded] = useFonts(fonts);
  return loaded ? boldStyle : undefined;
}
