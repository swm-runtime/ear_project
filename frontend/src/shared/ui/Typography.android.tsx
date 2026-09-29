import { createContext, forwardRef, useContext } from 'react';
import {
  Animated,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { androidFontStyle } from '@/shared/theme/android-font-style';
import { AndroidFontsLoaded } from '@/shared/theme/FontProvider.android';

const InheritedFont = createContext<TextStyle>({});

export const Text = forwardRef<NativeText, TextProps>(function Text(
  { style, children, ...props },
  ref,
) {
  const loaded = useContext(AndroidFontsLoaded);
  const inherited = useContext(InheritedFont);
  const flat = StyleSheet.flatten(style);
  // 중첩 Text는 부모의 의미상 굵기를 물려받는다. 매핑 후 normal 값이 자식의 기준이 되면 안 된다.
  const font = {
    fontWeight: flat?.fontWeight ?? inherited.fontWeight,
    fontFamily: flat?.fontFamily ?? inherited.fontFamily,
    fontStyle: flat?.fontStyle ?? inherited.fontStyle,
  };
  return (
    <NativeText {...props} ref={ref} style={[style, androidFontStyle(font, loaded)]}>
      <InheritedFont value={font}>{children}</InheritedFont>
    </NativeText>
  );
});

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput(
  { style, ...props },
  ref,
) {
  const loaded = useContext(AndroidFontsLoaded);
  return (
    <NativeTextInput
      {...props}
      ref={ref}
      style={[style, androidFontStyle(StyleSheet.flatten(style) ?? {}, loaded)]}
    />
  );
});

// 네이티브 ref를 전달해 기존 opacity·transform 애니메이션의 네이티브 드라이버를 유지한다.
export const AnimatedText = Animated.createAnimatedComponent(Text);
