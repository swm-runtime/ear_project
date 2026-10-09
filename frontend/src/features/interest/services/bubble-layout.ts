/**
 * 관심 주제 버블 배치 — 원들을 **빈틈 GAP 만 남기고 붙여** 놓고, 고른 버블이 커지면 이웃을 밀어낸다
 * (PM 2026-10-09 23:02 "약간의 공백을 제외하고 붙어 있게 · 선택되면 커지면서 주위가 밀려나게").
 *
 * 방법: 벌집 격자 위의 "집"에서 출발해, 겹친 쌍을 서로 밀어내고(충돌) 각자 집 쪽으로 살짝 당기는(복원) 것을
 * 정해진 횟수만큼 반복한다. 입력이 같으면 결과도 같다(난수 없음) — 같은 선택이면 매번 같은 자리다.
 * 커진 버블은 무거워서 덜 밀리고 작은 이웃이 비켜난다.
 */

export interface BubbleInput {
  /** 기본 지름(pt) */
  size: number;
  /** 지금 배율 — 선택 1.16 · 상한 뒤 남은 것 0.9 · 그 외 1 */
  scale: number;
}

export interface BubblePlace {
  /** 원의 중심 */
  cx: number;
  cy: number;
}

export interface BubbleLayout {
  places: BubblePlace[];
  /** 내용 높이 — 가장 아래 원의 바닥 + 아래 여백 */
  height: number;
}

/** 원과 원 사이 빈틈 */
export const BUBBLE_GAP = 6;
/** 좌우 바깥 여백 */
const SIDE_MARGIN = 10;
const TOP_MARGIN = 16;
const BOTTOM_MARGIN = 40;
/** 한 줄의 원 개수(3) + 엇갈림 반 칸 = 가로 3.5 칸 */
const COLUMNS = 3;
const ITERATIONS = 140;
/** 집으로 당기는 힘 — 작을수록 밀린 자리에 오래 머문다 */
const HOME_PULL = 0.06;
/** 지름 무늬(칸 대비 비율) — 크기가 섞여야 흩뿌린 느낌이 난다 */
const SIZE_PATTERN = [
  0.94, 1.0, 0.88, 0.97, 0.9, 1.02, 0.92, 0.86, 1.0, 0.89, 0.96, 1.01, 0.87, 0.95, 0.91, 0.98,
];

/** 화면 폭에 맞는 칸(벌집 가로 간격) — 3.5 칸이 좌우 여백 안을 채운다 */
export const bubblePitch = (width: number) => (width - SIDE_MARGIN * 2) / (COLUMNS + 0.5);

/** i 번째 버블의 기본 지름 — 칸에서 빈틈을 뺀 크기에 무늬를 곱한다 */
export const bubbleSize = (index: number, width: number) =>
  (bubblePitch(width) - BUBBLE_GAP) * SIZE_PATTERN[index % SIZE_PATTERN.length];

/** 벌집 격자의 집 — 짝수 줄은 왼쪽 붙임, 홀수 줄은 반 칸 오른쪽 */
const homeOf = (index: number, width: number) => {
  const pitch = bubblePitch(width);
  const row = Math.floor(index / COLUMNS);
  const col = index % COLUMNS;
  const offset = row % 2 === 0 ? 0.5 : 1;
  return {
    x: SIDE_MARGIN + (col + offset) * pitch,
    y: TOP_MARGIN + pitch / 2 + row * pitch * 0.866,
  };
};

export const layoutBubbles = (bubbles: BubbleInput[], width: number): BubbleLayout => {
  const homes = bubbles.map((_, index) => homeOf(index, width));
  const xs = homes.map((home) => home.x);
  const ys = homes.map((home) => home.y);
  const radii = bubbles.map((bubble) => (bubble.size * bubble.scale) / 2);
  // 큰 원일수록 무겁다 — 겹침을 반지름 비율로 나눠 작은 쪽이 더 움직인다
  const weights = radii.map((radius) => radius * radius);

  for (let step = 0; step < ITERATIONS; step += 1) {
    for (let i = 0; i < bubbles.length; i += 1) {
      for (let j = i + 1; j < bubbles.length; j += 1) {
        const dx = xs[j] - xs[i];
        const dy = ys[j] - ys[i];
        const distance = Math.hypot(dx, dy) || 0.01;
        const minimum = radii[i] + radii[j] + BUBBLE_GAP;
        if (distance >= minimum) continue;
        const overlap = minimum - distance;
        const ux = dx / distance;
        const uy = dy / distance;
        const total = weights[i] + weights[j];
        const shareI = weights[j] / total;
        const shareJ = weights[i] / total;
        xs[i] -= ux * overlap * shareI;
        ys[i] -= uy * overlap * shareI;
        xs[j] += ux * overlap * shareJ;
        ys[j] += uy * overlap * shareJ;
      }
    }
    for (let i = 0; i < bubbles.length; i += 1) {
      xs[i] += (homes[i].x - xs[i]) * HOME_PULL;
      ys[i] += (homes[i].y - ys[i]) * HOME_PULL;
      // 좌우·위 벽 — 화면 밖으로 밀려나가지 않는다(아래는 스크롤이라 열어 둔다)
      xs[i] = Math.min(width - SIDE_MARGIN - radii[i], Math.max(SIDE_MARGIN + radii[i], xs[i]));
      ys[i] = Math.max(TOP_MARGIN + radii[i], ys[i]);
    }
  }

  const bottom = bubbles.reduce((max, _, i) => Math.max(max, ys[i] + radii[i]), 0);
  return {
    places: xs.map((cx, i) => ({ cx, cy: ys[i] })),
    height: bottom + BOTTOM_MARGIN,
  };
};
