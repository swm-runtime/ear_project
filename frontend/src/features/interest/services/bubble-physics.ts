/**
 * 관심 주제 버블 물리 — 애플 뮤직 장르 선택·Magnetic 을 참고한 원 충돌 + 감속에, **버블마다 자기 자리**를 둔다.
 *
 * - 버블은 주제 순서대로 놓인 **자기 자리(home)** 로 끌린다(용수철). 모두가 한 점으로 끌리던 종전(중앙 중력)은 매번
 *   자리가 섞이고 고를 때 순서가 뒤바뀌었다(PM 2026-10-10 17:27 "버블 순서가 바뀌거나 끌려가거나 하는 건 좀 그렇다")
 * - 원끼리 빈틈 GAP 을 두고 부딪힌다 — 고른 원이 커지면 이웃이 비켜났다가, 자기 자리로 다시 당겨진다. 순서는 그대로다
 * - 처음엔 밭 바깥에서 출발해 각자 자리로 **날아들어 와** 모인다(PM 이 좋다고 한 등장). 움직이는 동안에는 벽을 두지
 *   않는다 — 벽이 있으면 바깥에서 출발한 원이 첫 프레임에 가장자리로 순간 이동한다. 자리 자체가 밭 안이라 넘치지 않는다
 * - 속도는 충돌을 푼 뒤 실제로 움직인 거리로 다시 잡는다(위치 기반 물리) — 눌려 선 원이 떨지 않는다
 * - 크기는 ±20% 로 섞는다(PM "버블 크기도 좀 다양했으면")
 *
 * stepBubbleSim·settleBubbleSim 은 worklet 이다 — Reanimated 프레임 콜백(UI 스레드)에서 돈다. 자리 계산(layoutHomes)은
 * 밭 크기·주제 수가 정해질 때 JS 에서 한 번 한다. 상태 배열은 제자리에서 고친다.
 */

export interface BubbleSim {
  /** 중심 */
  x: number[];
  y: number[];
  /** 속도(pt/s) */
  vx: number[];
  vy: number[];
  /** 이번 프레임을 시작할 때의 자리 — 충돌을 푼 뒤 속도를 다시 잡는 데 쓴다 */
  px: number[];
  py: number[];
  /** 자기 자리 — 주제 순서대로 정해져 바뀌지 않는다 */
  hx: number[];
  hy: number[];
  /** 기본 지름 */
  size: number[];
  /** 지금 배율과 목표 배율 */
  scale: number[];
  target: number[];
  /** 마지막으로 크게 움직인 뒤 흐른 시간(s) — 오래 고요하면 계산을 쉰다 */
  calmFor: number;
  /** 밭 크기와 한 줄의 개수 — 크기가 바뀌어 자리를 다시 잡을 때 같은 줄 구성을 쓴다(줄이 바뀌면 순서가 섞여 보인다) */
  width: number;
  height: number;
  perRow: number;
}

export const BUBBLE_GAP = 6;
/** 자리 격자 조임 — 1 이면 평균 크기 칸이라 작은 원끼리 붙은 곳에 틈이 남는다(10-10 17:37 "간격이 너무 커 보인다") */
const HOME_SQUEEZE = 0.88;
/** 자기 자리로 당기는 용수철 세기(1/s²) — 클수록 빨리·단단히 돌아간다 */
const HOME_SPRING = 70;
/** 매초 속도가 e^-DAMPING 배가 된다 — 용수철과 짝지어 한 번 살짝 넘쳤다 가라앉는 정도 */
const DAMPING = 9;
/** 배율이 목표를 따라가는 빠르기(1/s) — 0.2초 안팎에 거의 도달 */
const SCALE_RATE = 14;
/** 한 프레임 안에서 충돌을 몇 번 푸는가 */
const COLLISION_PASSES = 3;
const MAX_DT = 1 / 30;
/** 이 속도·배율 차 아래로 0.5초 머물면 고요 — 계산을 쉰다 */
const CALM_SPEED = 3;
const CALM_SCALE = 0.002;
export const CALM_SECONDS = 0.5;

/** 원들이 밭의 약 FILL 만큼을 덮게 기본 지름을 정한다 — 주제가 늘면 작아진다 */
const FILL = 0.5;
/** 크기 무늬 — ±20%. 큰 것과 작은 것이 이웃하게 섞는다(순서대로 돌려 쓴다) */
const SIZE_PATTERN = [
  1.12, 0.84, 1.0, 1.2, 0.9, 1.06, 0.8, 1.16, 0.94, 1.1, 0.86, 1.02, 1.18, 0.82, 1.04, 0.92,
];
export const MIN_BUBBLE = 64;
export const MAX_BUBBLE = 112;

export const bubbleBaseSize = (count: number, width: number, height: number): number => {
  if (count <= 0 || width <= 0 || height <= 0) return MIN_BUBBLE;
  const areaEach = (width * height * FILL) / count;
  const diameter = 2 * Math.sqrt(areaEach / Math.PI);
  return Math.min(MAX_BUBBLE, Math.max(MIN_BUBBLE, diameter));
};

export const bubbleSizeAt = (index: number, base: number) =>
  base * SIZE_PATTERN[index % SIZE_PATTERN.length];

/** 겹친 쌍을 크기 비율로 밀어낸다(큰 원이 덜 밀림). 벽(밭 크기)을 주면 밖으로 나간 원을 들인다 */
const resolveOverlaps = (
  x: number[],
  y: number[],
  size: number[],
  scale: number[] | null,
  walls: { width: number; height: number } | null,
) => {
  'worklet';
  const n = x.length;
  for (let i = 0; i < n; i += 1) {
    const ri = (size[i] * (scale ? scale[i] : 1)) / 2;
    for (let j = i + 1; j < n; j += 1) {
      const rj = (size[j] * (scale ? scale[j] : 1)) / 2;
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const minimum = ri + rj + BUBBLE_GAP;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minimum * minimum) continue;
      const dist = Math.sqrt(d2) || 0.01;
      const ux = dx / dist;
      const uy = dy / dist;
      const overlap = minimum - dist;
      const wi = ri * ri;
      const wj = rj * rj;
      const shareI = wj / (wi + wj);
      const shareJ = wi / (wi + wj);
      x[i] -= ux * overlap * shareI;
      y[i] -= uy * overlap * shareI;
      x[j] += ux * overlap * shareJ;
      y[j] += uy * overlap * shareJ;
    }
  }
  if (walls === null) return;
  for (let i = 0; i < n; i += 1) {
    const r = (size[i] * (scale ? scale[i] : 1)) / 2;
    x[i] = Math.min(walls.width - r, Math.max(r, x[i]));
    y[i] = Math.min(walls.height - r, Math.max(r, y[i]));
  }
};

/**
 * 자기 자리 — 주제 순서대로 벌집(엇갈린 줄)에 놓고, 크기가 섞여 겹친 곳을 풀어 빈틈 GAP 으로 붙인다. 덩어리는 밭 가운데.
 * 순서: 위 줄 왼쪽부터 오른쪽, 다음 줄 — 읽는 순서 그대로다
 */
export const rowCountFor = (sizes: number[], width: number) => {
  'worklet';
  const n = sizes.length;
  if (n === 0) return 2;
  const mean = sizes.reduce((sum, size) => sum + size, 0) / n;
  const pitch = mean + BUBBLE_GAP;
  // 한 줄에 몇 개 — 폭에 들어가는 만큼(엇갈림 반 칸 포함). 최소 2
  return Math.max(2, Math.floor((width - pitch / 2) / pitch));
};

/**
 * `sizes` 는 **지금 보이는 지름**(기본 지름 × 배율)이다 — 고른 원이 커지고 남은 원이 작아지면 그 크기로 자리를 다시
 * 잡아 옹기종기 붙는다(PM 2026-10-10 17:37 "나머지 원이 축소될 때 간격이 너무 커 보인다"). 줄 구성(perRow)은 처음 것을
 * 그대로 쓴다
 */
export const layoutHomes = (
  sizes: number[],
  width: number,
  height: number,
  perRow: number,
): { hx: number[]; hy: number[] } => {
  'worklet';
  const n = sizes.length;
  if (n === 0) return { hx: [], hy: [] };
  const mean = sizes.reduce((sum, size) => sum + size, 0) / n;
  // 격자를 평균보다 조여 둔다 — 원들이 서로 눌린 채 자리 잡아야 크기가 섞여도 틈이 안 벌어진다(마지막엔 겹침만 풀어 GAP 을 지킨다)
  const pitch = (mean + BUBBLE_GAP) * HOME_SQUEEZE;
  const rows = Math.ceil(n / perRow);
  const rowPitch = pitch * 0.88;
  const top = height / 2 - ((rows - 1) * rowPitch) / 2;
  const hx: number[] = [];
  const hy: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, n - row * perRow);
    const offset = row % 2 === 0 ? -pitch / 4 : pitch / 4;
    hx.push(width / 2 - ((inRow - 1) * pitch) / 2 + col * pitch + offset);
    hy.push(top + row * rowPitch);
  }
  // 크기가 섞여 겹친 곳을 푼다 — 격자 자리로 살짝 당기며(순서 유지), 마지막 40바퀴는 겹침만 푼다
  const ax = hx.slice();
  const ay = hy.slice();
  const walls = { width, height };
  for (let step = 0; step < 160; step += 1) {
    resolveOverlaps(hx, hy, sizes, null, walls);
    if (step < 120) {
      for (let i = 0; i < n; i += 1) {
        hx[i] += (ax[i] - hx[i]) * 0.08;
        hy[i] += (ay[i] - hy[i]) * 0.08;
      }
    }
  }
  return { hx, hy };
};

/**
 * 처음 자리 — 밭 바깥의 큰 원 위, **자기 자리와 같은 방향**(가운데에서 본 각도)에 둔다. 날아들어 오는 길이 서로
 * 엇갈리지 않아 순서대로 모인다. 동작 줄이기면 settleBubbleSim 으로 끝 상태를 바로 만든다
 */
export const createBubbleSim = (sizes: number[], width: number, height: number): BubbleSim => {
  const perRow = rowCountFor(sizes, width);
  const { hx, hy } = layoutHomes(sizes, width, height, perRow);
  const cx = width / 2;
  const cy = height / 2;
  const ring = Math.max(width, height) * 0.8;
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < sizes.length; i += 1) {
    const angle = Math.atan2(hy[i] - cy, hx[i] - cx);
    x.push(cx + Math.cos(angle) * ring);
    y.push(cy + Math.sin(angle) * ring);
  }
  return {
    x,
    y,
    vx: sizes.map(() => 0),
    vy: sizes.map(() => 0),
    px: x.slice(),
    py: y.slice(),
    hx,
    hy,
    size: sizes.slice(),
    scale: sizes.map(() => 1),
    target: sizes.map(() => 1),
    calmFor: 0,
    width,
    height,
    perRow,
  };
};

/**
 * 목표 배율이 바뀌었을 때 — 그 배율로 보일 지름으로 자리를 다시 잡는다(순서·줄 구성 그대로). 원들은 새 자리로
 * 용수철을 따라 옮겨 가며 서로 밀고 붙는다
 */
export const retargetBubbleSim = (sim: BubbleSim, targets: number[]) => {
  'worklet';
  const n = Math.min(sim.target.length, targets.length);
  for (let i = 0; i < n; i += 1) sim.target[i] = targets[i];
  const shown: number[] = [];
  for (let i = 0; i < sim.size.length; i += 1) shown.push(sim.size[i] * sim.target[i]);
  const homes = layoutHomes(shown, sim.width, sim.height, sim.perRow);
  for (let i = 0; i < sim.size.length; i += 1) {
    sim.hx[i] = homes.hx[i];
    sim.hy[i] = homes.hy[i];
  }
  sim.calmFor = 0;
};

/** 한 프레임 — dt 초만큼 진행한다. 고요해졌으면 true */
export const stepBubbleSim = (sim: BubbleSim, rawDt: number): boolean => {
  'worklet';
  const dt = Math.min(MAX_DT, Math.max(0, rawDt));
  const n = sim.x.length;
  if (n === 0 || dt === 0) return true;
  const decay = Math.exp(-DAMPING * dt);
  const scaleLerp = 1 - Math.exp(-SCALE_RATE * dt);

  let maxScaleGap = 0;
  for (let i = 0; i < n; i += 1) {
    const gap = sim.target[i] - sim.scale[i];
    sim.scale[i] += gap * scaleLerp;
    maxScaleGap = Math.max(maxScaleGap, Math.abs(gap));
    // 자기 자리로 — 용수철
    sim.vx[i] = (sim.vx[i] + (sim.hx[i] - sim.x[i]) * HOME_SPRING * dt) * decay;
    sim.vy[i] = (sim.vy[i] + (sim.hy[i] - sim.y[i]) * HOME_SPRING * dt) * decay;
    sim.px[i] = sim.x[i];
    sim.py[i] = sim.y[i];
    sim.x[i] += sim.vx[i] * dt;
    sim.y[i] += sim.vy[i] * dt;
  }
  for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
    resolveOverlaps(sim.x, sim.y, sim.size, sim.scale, null);
  }

  let maxSpeed = 0;
  for (let i = 0; i < n; i += 1) {
    sim.vx[i] = (sim.x[i] - sim.px[i]) / dt;
    sim.vy[i] = (sim.y[i] - sim.py[i]) / dt;
    maxSpeed = Math.max(maxSpeed, Math.sqrt(sim.vx[i] * sim.vx[i] + sim.vy[i] * sim.vy[i]));
  }
  if (maxSpeed < CALM_SPEED && maxScaleGap < CALM_SCALE) sim.calmFor += dt;
  else sim.calmFor = 0;
  return sim.calmFor >= CALM_SECONDS;
};

/** 동작 줄이기·테스트용 — 고요해질 때까지 한꺼번에 돌린다(최대 6초어치) */
export const settleBubbleSim = (sim: BubbleSim) => {
  'worklet';
  for (let i = 0; i < sim.scale.length; i += 1) sim.scale[i] = sim.target[i];
  for (let k = 0; k < 360; k += 1) {
    if (stepBubbleSim(sim, 1 / 60)) break;
  }
};
