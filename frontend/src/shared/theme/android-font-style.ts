import type { TextStyle } from 'react-native';

const families: Record<string, string> = {
  '400': 'Pretendard-Regular',
  '500': 'Pretendard-Medium',
  '600': 'Pretendard-SemiBold',
  '700': 'Pretendard-Bold',
};

/** iOS와 공유하는 의미상 굵기를 Android의 실제 글꼴 파일로 연결한다. */
export function androidFontStyle(style: TextStyle, loaded: boolean): TextStyle | undefined {
  if (!loaded || style.fontFamily || style.fontStyle === 'italic') return undefined;
  const weight = style.fontWeight ?? '400';
  const key = weight === 'normal' ? '400' : weight === 'bold' ? '700' : String(weight);
  const fontFamily = families[key];
  // 지원하지 않는 굵기는 OS 처리를 유지한다. 파일 자체의 굵기에 합성 볼드를 더하지 않는다.
  return fontFamily ? { fontFamily, fontWeight: 'normal' } : undefined;
}
