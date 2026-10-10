/**
 * 관심 주제 버블 물리 — 애플 뮤직 장르 선택(SpriteKit)과 그 클론 Magnetic 의 모델을 따른다
 * (PM 2026-10-10 "버블 최대한 좋게" — 조사: Magnetic 은 화면 중앙의 방사형 중력장 + 중력 0 + 마찰 0 + 감속 3 + 선택 4/3배).
 *
 * - 중앙으로 **일정한 세기**로 끌린다(방사형 중력장) → 모두가 한 덩어리로 뭉친다
 * - 원끼리 빈틈 GAP 을 두고 부딪힌다 — 겹친 만큼 크기 비율로 밀어낸다(큰 원이 덜 밀림). 속도는 충돌을 푼 뒤
 *   실제로 움직인 거리로 다시 잡아서(위치 기반 물리), 서로 눌려 멈춘 원은 속도도 0 이 된다 — 떨지 않는다
 * - 속도는 매초 지수로 줄어든다(감속) → 출렁이다 가라앉는다
 * - 크기는 목표 배율로 부드럽게 따라간다 — 커지는 동안에도 충돌이 계산되어 이웃이 연쇄로 밀린다
 *
 * 함수는 전부 worklet 이다 — Reanimated 의 프레임 콜백(UI 스레드)에서 매 프레임 돈다. 순수 계산이라 jest 로도 돈다.
 * 상태는 배열을 제자리에서 고친다(프레임마다 새 배열을 만들지 않는다).
 */

export interface BubbleSim {
  /** 중심 */
  x: number[];
  y: number[];
  /** 속도(pt/s) */
  vx: number[];
  vy: number[];
  /** 이번 프레임을 시작할 때의 자리 — 충돌을 푼 뒤 속도를 "실제로 움직인 거리 / dt"로 다시 잡는다(위치 기반 물리) */
  px: number[];
  py: number[];
  /** 기본 지름 */
  size: number[];
  /** 지금 배율과 목표 배율 */
  scale: number[];
  target: number[];
  /** 마지막으로 크게 움직인 뒤 흐른 시간(s) — 오래 고요하면 계산을 쉰다 */
  calmFor: number;
}

export const BUBBLE_GAP = 6;
/** 중앙으로 끄는 가속도(pt/s²) — 클수록 단단히 뭉친다 */
const GRAVITY = 1400;
/** 중심 근처에서는 중력을 거리 비례로 줄인다 — 한가운데서 떨지 않게 */
const GRAVITY_SOFT_RADIUS = 40;
/** 매초 속도가 e^-DAMPING 배가 된다(Magnetic linearDamping 3) */
const DAMPING = 3.2;
/** 배율이 목표를 따라가는 빠르기(1/s) — 0.2초 안팎에 거의 도달 */
const SCALE_RATE = 14;
/** 한 프레임 안에서 충돌을 몇 번 푸는가 — 많을수록 단단하다 */
const COLLISION_PASSES = 3;
const MAX_DT = 1 / 30;
/** 이 속도·배율 차 아래로 0.5초 머물면 고요 — 계산을 쉰다 */
const CALM_SPEED = 4;
const CALM_SCALE = 0.002;
export const CALM_SECONDS = 0.5;

/**
 * 밭의 넓이에 맞는 기본 지름 — 원들이 밭의 약 FILL 만큼을 덮게 한다. 주제가 늘면 작아진다.
 * 크기 무늬(±5%)로 흩뿌린 느낌을 낸다
 */
const FILL = 0.5;
const SIZE_PATTERN = [
  1.0, 1.05, 0.95, 1.02, 0.97, 1.05, 0.96, 0.95, 1.04, 0.97, 1.01, 1.05, 0.95, 1.02, 0.98, 1.03,
];
export const MIN_BUBBLE = 64;
export const MAX_BUBBLE = 116;

export const bubbleBaseSize = (count: number, width: number, height: number): number => {
  if (count <= 0 || width <= 0 || height <= 0) return MIN_BUBBLE;
  const areaEach = (width * height * FILL) / count;
  const diameter = 2 * Math.sqrt(areaEach / Math.PI);
  return Math.min(MAX_BUBBLE, Math.max(MIN_BUBBLE, diameter));
};

export const bubbleSizeAt = (index: number, base: number) =>
  base * SIZE_PATTERN[index % SIZE_PATTERN.length];

/**
 * 처음 자리 — 밭 바깥의 큰 원 위에 고르게 둔다. 중력이 안으로 끌어당겨 **날아들어 오는** 등장이 된다.
 * 동작 줄이기면 settleNow 로 끝 상태를 바로 만든다
 */
export const createBubbleSim = (sizes: number[], width: number, height: number): BubbleSim => {
  const cx = width / 2;
  const cy = height / 2;
  const ring = Math.max(width, height) * 0.75;
  const n = sizes.length;
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i += 1) {
    // 황금각으로 흩어 같은 각도에 몰리지 않게 — 난수 없이 매번 같다
    const angle = i * 2.399963;
    const r = ring * (0.85 + (0.15 * ((i * 7) % 5)) / 4);
    x.push(cx + Math.cos(angle) * r);
    y.push(cy + Math.sin(angle) * r);
  }
  return {
    x,
    y,
    vx: sizes.map(() => 0),
    vy: sizes.map(() => 0),
    px: x.slice(),
    py: y.slice(),
    size: sizes.slice(),
    scale: sizes.map(() => 1),
    target: sizes.map(() => 1),
    calmFor: 0,
  };
};

/** 한 프레임 — dt 초만큼 진행한다. 고요해졌으면 true */
export const stepBubbleSim = (
  sim: BubbleSim,
  width: number,
  height: number,
  rawDt: number,
): boolean => {
  'worklet';
  const dt = Math.min(MAX_DT, Math.max(0, rawDt));
  const n = sim.x.length;
  if (n === 0 || dt === 0) return true;
  const cx = width / 2;
  const cy = height / 2;
  const decay = Math.exp(-DAMPING * dt);
  const scaleLerp = 1 - Math.exp(-SCALE_RATE * dt);

  let maxSpeed = 0;
  let maxScaleGap = 0;
  for (let i = 0; i < n; i += 1) {
    // 배율 — 목표로 지수 접근
    const gap = sim.target[i] - sim.scale[i];
    sim.scale[i] += gap * scaleLerp;
    maxScaleGap = Math.max(maxScaleGap, Math.abs(gap));

    // 중앙으로 일정한 세기(가까우면 거리 비례로 약하게)
    const dx = cx - sim.x[i];
    const dy = cy - sim.y[i];
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const pull = dist < GRAVITY_SOFT_RADIUS ? dist / GRAVITY_SOFT_RADIUS : 1;
    sim.vx[i] = (sim.vx[i] + (dx / dist) * GRAVITY * pull * dt) * decay;
    sim.vy[i] = (sim.vy[i] + (dy / dist) * GRAVITY * pull * dt) * decay;
    sim.px[i] = sim.x[i];
    sim.py[i] = sim.y[i];
    sim.x[i] += sim.vx[i] * dt;
    sim.y[i] += sim.vy[i] * dt;
  }

  for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
    for (let i = 0; i < n; i += 1) {
      const ri = (sim.size[i] * sim.scale[i]) / 2;
      for (let j = i + 1; j < n; j += 1) {
        const rj = (sim.size[j] * sim.scale[j]) / 2;
        const dx = sim.x[j] - sim.x[i];
        const dy = sim.y[j] - sim.y[i];
        const minimum = ri + rj + BUBBLE_GAP;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minimum * minimum) continue;
        const dist = Math.sqrt(d2) || 0.01;
        const ux = dx / dist;
        const uy = dy / dist;
        const overlap = minimum - dist;
        // 큰 원이 무겁다 — 작은 쪽이 더 비켜난다
        const wi = ri * ri;
        const wj = rj * rj;
        const shareI = wj / (wi + wj);
        const shareJ = wi / (wi + wj);
        sim.x[i] -= ux * overlap * shareI;
        sim.y[i] -= uy * overlap * shareI;
        sim.x[j] += ux * overlap * shareJ;
        sim.y[j] += uy * overlap * shareJ;
      }
    }
    // 벽 — 밭 밖으로 나가지 않는다
    for (let i = 0; i < n; i += 1) {
      const r = (sim.size[i] * sim.scale[i]) / 2;
      if (sim.x[i] < r) {
        sim.x[i] = r;
        if (sim.vx[i] < 0) sim.vx[i] = 0;
      } else if (sim.x[i] > width - r) {
        sim.x[i] = width - r;
        if (sim.vx[i] > 0) sim.vx[i] = 0;
      }
      if (sim.y[i] < r) {
        sim.y[i] = r;
        if (sim.vy[i] < 0) sim.vy[i] = 0;
      } else if (sim.y[i] > height - r) {
        sim.y[i] = height - r;
        if (sim.vy[i] > 0) sim.vy[i] = 0;
      }
    }
  }

  for (let i = 0; i < n; i += 1) {
    // 충돌·벽이 막은 만큼은 속도에서 빠진다 — 눌려 선 원은 0
    sim.vx[i] = (sim.x[i] - sim.px[i]) / dt;
    sim.vy[i] = (sim.y[i] - sim.py[i]) / dt;
    maxSpeed = Math.max(maxSpeed, Math.sqrt(sim.vx[i] * sim.vx[i] + sim.vy[i] * sim.vy[i]));
  }
  if (maxSpeed < CALM_SPEED && maxScaleGap < CALM_SCALE) sim.calmFor += dt;
  else sim.calmFor = 0;
  return sim.calmFor >= CALM_SECONDS;
};

/** 동작 줄이기·테스트용 — 고요해질 때까지 한꺼번에 돌린다(최대 6초어치) */
export const settleBubbleSim = (sim: BubbleSim, width: number, height: number) => {
  'worklet';
  for (let k = 0; k < 360; k += 1) {
    sim.scale.forEach((_, i) => {
      sim.scale[i] = sim.target[i];
    });
    if (stepBubbleSim(sim, width, height, 1 / 60)) break;
  }
};
