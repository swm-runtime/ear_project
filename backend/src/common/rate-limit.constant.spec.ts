/**
 * 클러스터에서 **정책 수치가 곧 사용자 흐름인 한도를 나누지 않는다**를 고정한다.
 *
 * 2026-09-22: 워커 수로 전부 나눴다가, 메일 인증 5회가 3회로 줄어 **정책이 5회인데 4번째에서
 * 429** 가 나는 것을 운영 적용 직전에 발견했다. Caddy 가 keep-alive 로 연결을 재사용해 한
 * 사용자의 재시도가 같은 워커에 몰리기 때문이다. 주석만으로는 다음 사람이 또 나눌 수 있어
 * 테스트로 못 박는다.
 */
describe('rate-limit.constant — 클러스터에서 나누는 한도와 나누지 않는 한도', () => {
  const original = process.env.CLUSTER_WORKERS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CLUSTER_WORKERS;
    } else {
      process.env.CLUSTER_WORKERS = original;
    }
    jest.resetModules();
  });

  type Limits = typeof import('./rate-limit.constant');

  /**
   * 상수는 모듈 로드 시점에 계산된다 — 워커 수를 바꾼 뒤 **다시 읽어야** 한다.
   * jest 가 CommonJS 로 도는 환경이라 동적 `import()` 가 아니라 `require` 를 쓴다.
   */
  function loadWith(workers: string | undefined): Limits {
    if (workers === undefined) {
      delete process.env.CLUSTER_WORKERS;
    } else {
      process.env.CLUSTER_WORKERS = workers;
    }
    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./rate-limit.constant') as Limits;
  }

  it('워커가 1개면 모든 한도가 정책 수치 그대로다', () => {
    const c = loadWith(undefined);

    expect(c.RATE_LIMIT_DEFAULT_PER_MINUTE).toBe(300);
    expect(c.RATE_LIMIT_AUTH_PER_MINUTE).toBe(20);
    expect(c.RATE_LIMIT_EMAIL_SEND_PER_MINUTE).toBe(5);
    expect(c.RATE_LIMIT_AUDIO_URL_PER_MINUTE).toBe(30);
  });

  it('여유가 큰 한도는 워커 수로 나눠 합을 유지한다', () => {
    const c = loadWith('2');

    expect(c.RATE_LIMIT_DEFAULT_PER_MINUTE).toBe(150);
    expect(c.RATE_LIMIT_AUDIO_URL_PER_MINUTE).toBe(15);
  });

  it('**인증·이메일 한도는 워커가 늘어도 줄지 않는다** — 줄면 정상 사용자의 흐름이 끊긴다', () => {
    const two = loadWith('2');
    expect(two.RATE_LIMIT_AUTH_PER_MINUTE).toBe(20);
    expect(two.RATE_LIMIT_EMAIL_SEND_PER_MINUTE).toBe(5);

    const four = loadWith('4');
    expect(four.RATE_LIMIT_AUTH_PER_MINUTE).toBe(20);
    expect(four.RATE_LIMIT_EMAIL_SEND_PER_MINUTE).toBe(5);
  });

  it('메일 인증 5회가 한 워커에 몰려도 정책대로 5회까지 통과한다 — 이번 회귀의 핵심', () => {
    const c = loadWith('2');

    // keep-alive 로 한 연결에 몰린 최악의 경우: 5회가 전부 같은 워커로 간다
    const worstCaseOnOneWorker = 5;

    expect(worstCaseOnOneWorker).toBeLessThanOrEqual(
      c.RATE_LIMIT_EMAIL_SEND_PER_MINUTE,
    );
  });
});
