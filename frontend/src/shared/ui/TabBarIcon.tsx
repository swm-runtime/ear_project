import { Platform } from 'react-native';
import Svg, { Circle, Defs, G, Mask, Path, Rect } from 'react-native-svg';

import { theme } from '@/shared/theme';

import PersonIcon from './PersonIcon';

export type TabBarIconName = 'library' | 'explore' | 'profile';

interface TabBarIconProps {
  name: TabBarIconName;
  color: string;
  /** 선택된 탭은 면으로, 나머지는 선으로 그린다 */
  focused: boolean;
  size: number;
}

/** 책 획 굵기 — iOS 실측(1.83)보다 가늘게(PM 2026-09-29 16:07 "아이콘 굵기 줄여") */
const BOOK_STROKE = 1.5;
/** 나침반 테두리 굵기 — 실측 2 보다 가늘게(같은 지시) */
const COMPASS_STROKE = 1.6;
/** 책 띠 굵기 */
const BAND_STROKE = 1;

/*
 * 책 네 권(books.vertical 모양) — 28×25 판. 왼쪽 세 권은 바닥과 칸막이를 같이 쓰고(가운데가 가장 짧고 띠 두 줄),
 * 맨 오른쪽 한 권은 따로 서서 위가 왼쪽으로 4° 기운다
 */
const BOOK_A = 'M5.83 24.08H1.92a1 1 0 0 1-1-1V5.25a1 1 0 0 1 1-1h2.91a1 1 0 0 1 1 1Z';
const BOOK_B = 'M5.83 24.08V7.83h8.34v16.25Z';
const BOOK_C = 'M14.17 24.08V1.92a1 1 0 0 1 1-1h3.66a1 1 0 0 1 1 1v21.16a1 1 0 0 1-1 1H1.92';
const BOOK_BANDS = 'M8.3 10.83h3.6M8.3 21.17h3.6';
/*
 * **Android 라이브러리 아이콘 — Solar `library`**(480 Design, CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/).
 * PM 2026-09-30 00:56 선택. 선 변형은 원본 획 1.5 를 **1.25 로 줄였다**(변경 사항 — CC BY 는 변경 표시를 요구한다),
 * 채운 변형(`library-bold`)은 원본 그대로. 출처는 frontend/THIRD_PARTY_NOTICES.md
 */
const SOLAR_LIBRARY_STROKE = 1.25;
const SOLAR_LIBRARY_LINES = [
  'M19.5617 7C19.7904 5.69523 18.7863 4.5 17.4617 4.5H6.53788C5.21323 4.5 4.20922 5.69523 4.43784 7',
  'M17.4999 4.5C17.5283 4.24092 17.5425 4.11135 17.5427 4.00435C17.545 2.98072 16.7739 2.12064 15.7561 2.01142C15.6497 2 15.5194 2 15.2588 2H8.74099C8.48035 2 8.35002 2 8.24362 2.01142C7.22584 2.12064 6.45481 2.98072 6.45704 4.00434C6.45727 4.11135 6.47146 4.2409 6.49983 4.5',
  'M15 18H9',
  'M2.38351 13.793C1.93748 10.6294 1.71447 9.04765 2.66232 8.02383C3.61017 7 5.29758 7 8.67239 7H15.3276C18.7024 7 20.3898 7 21.3377 8.02383C22.2855 9.04765 22.0625 10.6294 21.6165 13.793L21.1935 16.793C20.8437 19.2739 20.6689 20.5143 19.7717 21.2572C18.8745 22 17.5512 22 14.9046 22H9.09536C6.44881 22 5.12553 22 4.22834 21.2572C3.33115 20.5143 3.15626 19.2739 2.80648 16.793L2.38351 13.793Z',
];
const SOLAR_LIBRARY_BOLD = [
  'M8.50989 2.00001H15.49C15.7225 1.99995 15.9007 1.99991 16.0565 2.01515C17.1643 2.12352 18.0711 2.78958 18.4556 3.68678H5.54428C5.92879 2.78958 6.83555 2.12352 7.94337 2.01515C8.09917 1.99991 8.27741 1.99995 8.50989 2.00001Z',
  'M6.31052 4.72312C4.91989 4.72312 3.77963 5.56287 3.3991 6.67691C3.39117 6.70013 3.38356 6.72348 3.37629 6.74693C3.77444 6.62636 4.18881 6.54759 4.60827 6.49382C5.68865 6.35531 7.05399 6.35538 8.64002 6.35547L8.75846 6.35547L15.5321 6.35547C17.1181 6.35538 18.4835 6.35531 19.5639 6.49382C19.9833 6.54759 20.3977 6.62636 20.7958 6.74693C20.7886 6.72348 20.781 6.70013 20.773 6.67691C20.3925 5.56287 19.2522 4.72312 17.8616 4.72312H6.31052Z',
];
const SOLAR_LIBRARY_BOLD_BODY =
  'M8.67239 7.54204H15.3276C18.7024 7.54204 20.3898 7.54204 21.3377 8.52887C22.2855 9.5157 22.0625 11.0403 21.6165 14.0896L21.1935 16.9811C20.8437 19.3724 20.6689 20.568 19.7717 21.284C18.8745 22 17.5512 22 14.9046 22H9.09536C6.44881 22 5.12553 22 4.22834 21.284C3.33115 20.568 3.15626 19.3724 2.80648 16.9811L2.38351 14.0896C1.93748 11.0403 1.71447 9.5157 2.66232 8.52887C3.61017 7.54204 5.29758 7.54204 8.67239 7.54204ZM8 18.0001C8 17.5859 8.3731 17.2501 8.83333 17.2501H15.1667C15.6269 17.2501 16 17.5859 16 18.0001C16 18.4144 15.6269 18.7502 15.1667 18.7502H8.83333C8.3731 18.7502 8 18.4144 8 18.0001Z';

/** 나침반 바늘(45° 마름모) + 가운데 구멍 — evenodd 로 구멍이 뚫린다 */
const NEEDLE = 'M17.8 6.2 14.4 14.4 6.2 17.8 9.6 9.6Z';
const NEEDLE_HOLE = 'M12 10.8a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4Z';

/**
 * 하단 탭 아이콘.
 *
 * **선택 여부를 색으로만 알리지 않는다**(각 uiux 7장) — 선택된 탭은 면(fill), 나머지는
 * 선(stroke)으로 그려 형태 자체가 달라지게 한다. 활성·비활성 색이 검정과 회색이라
 * 색만 두면 색각 이상·저조도에서 어느 탭에 있는지 읽히지 않는다.
 *
 * 라벨이 항상 함께 있으므로 아이콘은 장식이다 — 낭독기 노출은 탭 자체가 담당한다.
 *
 * **모양은 iOS 26 시스템 탭 바 아이콘을 그대로 따른다**(PM 2026-09-29 "아이콘이 다르잖아 — 무조건 찾아"). iOS 실기기
 * 스샷(3x)의 픽셀을 재서 치수를 옮겼다 — 책 네 권(28×25pt) · 원 + 채운 45° 바늘과 가운데 구멍(23pt) · 사람(머리 + 돔
 * 어깨). SF Symbols 는 애플 플랫폼 밖에서 쓸 수 없어(라이선스) 벡터를 가져오지 않고 치수만 재서 직접 그렸다.
 * 이 SVG 는 Android 와 iOS 26 미만의 캡슐 탭 바, 첫 실행 튜토리얼이 쓴다(iOS 26 은 시스템 SF Symbols)
 */
export default function TabBarIcon({ name, color, focused, size }: TabBarIconProps) {
  if (name === 'library' && Platform.OS === 'android') {
    // Android 는 Solar library(위 상수 주석) — iOS 탭 바를 따른 책 아이콘은 iOS 26 미만·튜토리얼에 남는다
    return focused ? (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {SOLAR_LIBRARY_BOLD.map((d) => (
          <Path key={d.slice(0, 12)} d={d} fill={color} />
        ))}
        <Path d={SOLAR_LIBRARY_BOLD_BODY} fill={color} fillRule="evenodd" />
      </Svg>
    ) : (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <G fill="none" stroke={color} strokeWidth={SOLAR_LIBRARY_STROKE} strokeLinecap="round">
          {SOLAR_LIBRARY_LINES.map((d) => (
            <Path key={d.slice(0, 12)} d={d} />
          ))}
        </G>
      </Svg>
    );
  }

  if (name === 'library') {
    // 28×25 판을 높이 size 에 맞춘다 — 다른 아이콘(정사각 size)보다 가로가 조금 넓다(iOS 도 그렇다)
    const width = (size * 28) / 25;
    if (focused) {
      // 채운 변형 — 칸막이와 띠를 뚫어 권이 구분되게 한다
      return (
        <Svg width={width} height={size} viewBox="0 0 28 25">
          <Defs>
            <Mask id="tab-library-cut">
              <Rect x="0" y="0" width="28" height="25" fill="#fff" />
              {/* 칸막이 두 줄 + 기운 책 왼쪽 가장자리(세 번째 책과 위에서 맞닿는다) */}
              <Path
                d="M5.83 5.2V23.2M14.17 7.83V23.2M20.85 25L19.4 2"
                stroke="#000"
                strokeWidth={0.9}
              />
              <Path d={BOOK_BANDS} stroke="#000" strokeWidth={BAND_STROKE} strokeLinecap="round" />
            </Mask>
          </Defs>
          <G mask="url(#tab-library-cut)" fill={color}>
            {/*
              테두리 없이 면만(PM 2026-09-29 16:20 "색칠됐을 때 외곽선 없애") — 선 변형의 바깥선에 맞춘 면이라 두 상태의
              크기가 같다(선 경로 + 획 절반 = 이 사각형들)
            */}
            <Rect x="0.17" y="3.5" width="6.41" height="21.33" rx="1.6" />
            <Rect x="5.08" y="7.08" width="9.84" height="17.75" rx="0.4" />
            <Rect x="13.42" y="0.17" width="7.16" height="24.66" rx="1.6" />
          </G>
          <Rect
            x={22.05 - BOOK_STROKE / 2}
            y={3.83 - BOOK_STROKE / 2}
            width={4 + BOOK_STROKE}
            height={20.25 + BOOK_STROKE}
            rx="1.6"
            fill={color}
            transform="rotate(-4 24.05 24.08)"
          />
        </Svg>
      );
    }
    return (
      <Svg width={width} height={size} viewBox="0 0 28 25">
        <G fill="none" stroke={color} strokeWidth={BOOK_STROKE} strokeLinejoin="round">
          <Path d={BOOK_A} />
          <Path d={BOOK_B} />
          <Path d={BOOK_C} />
          <Rect
            x="22.05"
            y="3.83"
            width="4"
            height="20.25"
            rx="1"
            transform="rotate(-4 24.05 24.08)"
          />
        </G>
        <Path d={BOOK_BANDS} stroke={color} strokeWidth={BAND_STROKE} strokeLinecap="round" />
      </Svg>
    );
  }

  if (name === 'explore') {
    if (focused) {
      // 채운 변형 — 원을 채우고 바늘은 **흰색**으로 칠한다(가운데 구멍으로 원 색이 비친다). 종전엔 바늘을 뚫어
      // 뒤 유리 회색이 비쳤다(PM 2026-09-29 16:19 "색칠될 때 침 부분은 흰색으로")
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="11.5" fill={color} />
          <Path d={`${NEEDLE} ${NEEDLE_HOLE}`} fill={theme.color.onPrimary} fillRule="evenodd" />
        </Svg>
      );
    }
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="10.5" fill="none" stroke={color} strokeWidth={COMPASS_STROKE} />
        <Path d={`${NEEDLE} ${NEEDLE_HOLE}`} fill={color} fillRule="evenodd" />
      </Svg>
    );
  }

  // 닉네임 없는 계정의 아바타와 같은 도형을 쓴다(shared/ui/PersonIcon)
  return <PersonIcon size={size} color={color} filled={focused} />;
}
