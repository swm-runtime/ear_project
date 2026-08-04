/**
 * auth.md 4.5 — 이메일 인증 응답은 존재 여부·검증 결과와 무관하게 응답 시간을 일정하게 유지한다.
 * 처리 시간이 최소 시간보다 짧으면 남은 만큼 지연시켜 타이밍으로 정보가 새지 않게 한다.
 */
export async function withMinimumDuration<T>(
  minimumMs: number,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = process.hrtime.bigint();

  try {
    return await task();
  } finally {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const remainingMs = minimumMs - elapsedMs;

    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingMs));
    }
  }
}
