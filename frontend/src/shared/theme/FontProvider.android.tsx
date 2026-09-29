import { useFonts } from 'expo-font';
import { createContext, type PropsWithChildren } from 'react';

export const AndroidFontsLoaded = createContext(false);
const fonts = {
  'Pretendard-Regular': require('../../../assets/fonts/Pretendard-Regular.otf'),
  'Pretendard-Medium': require('../../../assets/fonts/Pretendard-Medium.otf'),
  'Pretendard-SemiBold': require('../../../assets/fonts/Pretendard-SemiBold.otf'),
  'Pretendard-Bold': require('../../../assets/fonts/Pretendard-Bold.otf'),
};

/** 스플래시를 표시하는 동안 로드한다. 실패해도 진입을 막지 않고 시스템 글꼴을 쓴다. */
export default function FontProvider({ children }: PropsWithChildren) {
  const [loaded] = useFonts(fonts);
  return <AndroidFontsLoaded value={loaded}>{children}</AndroidFontsLoaded>;
}
