import {
  cpuPercentBetween,
  parseMeminfo,
  parseProcStatCpu,
} from './admin-system-stats.service';

describe('admin-system-stats 파싱 헬퍼', () => {
  it('/proc/stat의 cpu 집계 행에서 idle(iowait 포함)과 total을 읽는다', () => {
    const procStat = [
      'cpu  100 0 50 800 40 0 10 0 0 0',
      'cpu0 50 0 25 400 20 0 5 0 0 0',
    ].join('\n');

    expect(parseProcStatCpu(procStat)).toEqual({ idle: 840, total: 1000 });
  });

  it('두 스냅샷 사이 구간 사용률을 계산한다 — 유휴 600/구간 1000이면 40%', () => {
    const percent = cpuPercentBetween(
      { idle: 840, total: 1000 },
      { idle: 1440, total: 2000 },
    );

    expect(percent).toBeCloseTo(40);
  });

  it('구간이 0이거나 음수면 null — 가상화 환경의 시계 역행을 값으로 만들지 않는다', () => {
    expect(
      cpuPercentBetween({ idle: 840, total: 1000 }, { idle: 840, total: 1000 }),
    ).toBeNull();
  });

  it('meminfo에서 MemTotal·MemAvailable을 바이트로 읽는다', () => {
    const meminfo = [
      'MemTotal:        4030000 kB',
      'MemFree:          200000 kB',
      'MemAvailable:    2500000 kB',
    ].join('\n');

    expect(parseMeminfo(meminfo)).toEqual({
      totalBytes: 4030000 * 1024,
      availableBytes: 2500000 * 1024,
    });
  });

  it('MemAvailable이 없으면(구형 커널) null — 폴백(os.freemem)으로 넘긴다', () => {
    expect(parseMeminfo('MemTotal: 4030000 kB\nMemFree: 200000 kB')).toBeNull();
  });
});
