import { describe, expect, it } from '@jest/globals';
import type { TextStyle } from 'react-native';

import { androidFontStyle } from './android-font-style';

describe('Android 글꼴 굵기', () => {
  it.each([
    ['400', 'Regular'],
    ['500', 'Medium'],
    ['600', 'SemiBold'],
    ['700', 'Bold'],
    ['normal', 'Regular'],
    ['bold', 'Bold'],
    [600, 'SemiBold'],
    [undefined, 'Regular'],
  ] as [TextStyle['fontWeight'], string][])(
    '%s를 실제 %s 파일에 연결하고 합성 굵기를 끈다',
    (fontWeight, face) => {
      expect(androidFontStyle({ fontWeight }, true)).toEqual({
        fontFamily: `Pretendard-${face}`,
        fontWeight: 'normal',
      });
    },
  );

  it('로딩 중·실패 시 시스템 글꼴을 유지한다', () => {
    expect(androidFontStyle({ fontWeight: '600' }, false)).toBeUndefined();
  });

  it('명시한 글꼴·기울임·지원 밖 굵기는 덮어쓰지 않는다', () => {
    expect(androidFontStyle({ fontFamily: 'monospace', fontWeight: '700' }, true)).toBeUndefined();
    expect(androidFontStyle({ fontStyle: 'italic' }, true)).toBeUndefined();
    expect(androidFontStyle({ fontWeight: '900' }, true)).toBeUndefined();
  });
});
