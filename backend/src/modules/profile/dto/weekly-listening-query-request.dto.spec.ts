import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { WeeklyListeningQueryRequestDto } from './weekly-listening-query-request.dto';

async function errorsOf(weekStart: string) {
  return validate(
    plainToInstance(WeeklyListeningQueryRequestDto, { week_start: weekStart }),
  );
}

describe('WeeklyListeningQueryRequestDto', () => {
  it('날짜 라벨을 받는다', async () => {
    await expect(errorsOf('2026-10-12')).resolves.toHaveLength(0);
  });

  it('달력에 없는 날짜는 거절한다 — 2026-02-30 이 다음 달 월요일로 넘어가 통과하지 않는다', async () => {
    await expect(errorsOf('2026-02-30')).resolves.toHaveLength(1);
  });

  it('시각 문자열은 거절한다 — 라벨만 받는다', async () => {
    await expect(errorsOf('2026-10-12T00:00:00Z')).resolves.not.toHaveLength(0);
  });
});
