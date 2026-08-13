import Svg, { Path } from 'react-native-svg';

interface SettingsIconProps {
  size: number;
  color: string;
}

/**
 * 설정 톱니. 글리프(`⚙`)는 기기에 따라 컬러 이모지로 그려지고 모양도 제각각이라
 * 색을 지정할 수 없다 — 알림 종(BellIcon)과 같은 이유로 도형으로 그린다.
 */
export default function SettingsIcon({ size, color }: SettingsIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M19.4 13a7.8 7.8 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.3 7.3 0 0 0-1.7-1L14.5 2.42a.5.5 0 0 0-.5-.42h-4a.5.5 0 0 0-.5.42L9.2 5.08a7.3 7.3 0 0 0-1.7 1l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64L4.6 11a7.8 7.8 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.49-1a7.3 7.3 0 0 0 1.7 1l.3 2.66a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.3-2.66a7.3 7.3 0 0 0 1.7-1l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"
      />
    </Svg>
  );
}
