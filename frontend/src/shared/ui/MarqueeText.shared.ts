import type { StyleProp, TextStyle } from 'react-native';

/** MarqueeText 의 공통 조각 — 네이티브 판(MaskedView)과 웹 판(SVG)이 같은 API·같은 페이드 곡선을 쓴다 */
export interface MarqueeTextProps {
  text: string;
  /** 글자 스타일. `lineHeight`가 있으면 뷰포트 높이로 쓴다 — 없으면 fontSize×1.3 */
  style?: StyleProp<TextStyle>;
  /** 흐르는 속도(px/초) */
  speed?: number;
  /** 흐르기 시작 전·한 바퀴 돈 뒤의 정지 시간 */
  pauseMs?: number;
  /** 원문과 반복본 사이 간격(px) */
  gap?: number;
  /** 양끝에서 글자가 투명해지는 구간(px). 0이면 그냥 잘린다 */
  fadeWidth?: number;
  /**
   * 멈춰 두기 — 켜져 있는 동안 첫 글자 자리(0)에 서 있고, 꺼지면 정지 시간부터 **처음부터** 다시 흐른다.
   * 화면 전환 중처럼 글자가 가려져 있거나 정지 그림과 맞물려야 할 때 쓴다(2026-09-18)
   */
  isPaused?: boolean;
}

export const DEFAULT_SPEED = 36;
export const DEFAULT_PAUSE_MS = 1800;
export const DEFAULT_GAP = 56;
/**
 * 글자 두 개 폭쯤. 좁으면 마지막 글자가 반쯤 남은 채 가장자리에 부딪히고(2026-09-17), 넓으면 가리는 게 세서
 * 제목 폭이 줄어 보인다(2026-09-18 PM) — 끝 10%만 완전 투명이면 이 폭으로 충분하다
 */
export const DEFAULT_FADE_WIDTH = 64;
/** 페이드 구간에서 완전 투명이 되는 지점(0~1) — 그 뒤는 가장자리까지 0 */
const FADE_END = 0.9;
/** 곡선을 이 개수의 stop 으로 근사한다 — 선형 보간 사이 꺾임이 보이지 않을 만큼 */
export const FADE_STOPS = 9;

/**
 * 가장자리 페이드 곡선 — 코사인 ease-in-out. 양끝에서 기울기가 0이라 "진하다가 갑자기 흐려지는" 꺾임도,
 * "옅게 오래 끌리는" 꼬리도 없다(2026-09-18 PM: 계단처럼 보이는 3단 곡선 대신 자연스럽게).
 * `edge` 는 0(뷰포트 바깥쪽 끝)~1(안쪽), 반환은 그 지점의 글자 불투명도
 */
export const fadeOpacity = (edge: number) => {
  const t = Math.min(1, edge / FADE_END);
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
};
/** 바깥쪽이 offset 0 인 방향(왼쪽 페이드)과 안쪽이 0 인 방향(오른쪽 페이드)의 stop 목록 */
export const fadeStops = (outerFirst: boolean) =>
  Array.from({ length: FADE_STOPS }, (_, i) => {
    const offset = i / (FADE_STOPS - 1);
    const edge = outerFirst ? offset : 1 - offset;
    return { offset, opacity: Number(fadeOpacity(edge).toFixed(3)) };
  });
/** 트랙 폭 — 어떤 제목보다 넓기만 하면 된다. 뷰포트가 잘라 보이지 않는다 */
export const TRACK_WIDTH = 10000;
/** 한글·라틴 글자의 시각적 가운데는 기준선에서 글자 크기의 이 비율만큼 위다 — SVG 텍스트를 줄 가운데에 앉히는 값 */
export const BASELINE_RATIO = 0.36;

