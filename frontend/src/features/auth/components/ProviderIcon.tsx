import Svg, { Path } from 'react-native-svg';

import type { SocialProvider } from '../auth.types';

interface ProviderIconProps {
  provider: SocialProvider;
  size: number;
  /** 단색 심볼(카카오·네이버)의 색. 구글은 브랜드 4색 고정이라 무시된다 */
  color: string;
}

/**
 * 제공자 브랜드 심볼. 경로는 와이어프레임(`docs/wireframe/auth.html` A1)의 SVG와 같은 것을 쓴다 —
 * 화면과 와이어프레임이 다른 마크를 쓰면 대조가 안 된다.
 *
 * 색·형태는 브랜드 가이드 고정값이다. 임의로 바꾸면 심사 반려 사유가 된다(auth-uiux.md 4.1).
 * 구글 심볼은 4색이 규정이라 `color`를 받지 않는다.
 */
export default function ProviderIcon({ provider, size, color }: ProviderIconProps) {
  if (provider === 'kakao') {
    return (
      <Svg width={size} height={size} viewBox="0 0 18 17">
        <Path
          fill={color}
          d="M9 0C4 0 0 3.1 0 7c0 2.5 1.7 4.7 4.2 5.9l-1 3.7c-.1.3.3.6.6.4l4.4-2.9c.3 0 .5.1.8.1 5 0 9-3.1 9-7S14 0 9 0z"
        />
      </Svg>
    );
  }

  if (provider === 'naver') {
    return (
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <Path fill={color} d="M10.4 8.5 5.4 1H1v14h4.6V7.5l5 7.5H15V1h-4.6z" />
      </Svg>
    );
  }

  if (provider === 'apple') {
    return (
      <Svg width={size} height={size} viewBox="0 0 18 22">
        <Path
          fill={color}
          d="M14.9 11.6c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.6-1.9-1.5-.2-3 .9-3.7.9-.8 0-2-.9-3.3-.8-1.7 0-3.2 1-4.1 2.5-1.7 3-.4 7.5 1.3 9.9.8 1.2 1.8 2.5 3.1 2.5 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.8zM12.5 4.2c.7-.8 1.1-2 1-3.2-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.2-.6 2.9-1.4z"
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path
        fill="#4285F4"
        d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"
      />
      <Path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
      <Path
        fill="#EA4335"
        d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15 2.3A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"
      />
    </Svg>
  );
}
