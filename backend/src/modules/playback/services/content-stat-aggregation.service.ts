import { Injectable, Logger } from '@nestjs/common';

import {
  ALL_TIME_PERIOD_START,
  StatsPeriodType,
} from '@/modules/content/content.enum';
import {
  shiftWeekStart,
  toCurrentWeekStart,
  toServiceDate,
} from '@/common/utils/service-date.util';

import { ContentStatAggregationRepository } from '../repositories/content-stat-aggregation.repository';

/**
 * `content_stats` 집계(domain.md 5.4). **`playback` 모듈이 실행한다**(같은 절).
 *
 * 없는 동안 모든 `play_count`가 0이었고, 그래서 탐색 인기·검색 동점 해소·드립 인기도 축이
 * 전부 상수로 동작했다 — **랭킹이 사실상 `published_at` 순이었다.**
 *
 * ## 확정과 잠금
 *
 * "직전 확정 구간의 값으로 순위를 보여준다"(5.4). 그래서 **끝난 구간은 `is_final = true`로
 * 잠그고**, 진행 중인 구간은 잠그지 않은 채 갱신한다. 잠긴 행은 이후 배치가 건드리지 않는다 —
 * 정산·리포팅이 그 값을 읽기 때문이다.
 */
@Injectable()
export class ContentStatAggregationService {
  private readonly logger = new Logger(ContentStatAggregationService.name);

  constructor(private readonly repository: ContentStatAggregationRepository) {}

  /**
   * 주간·월간·전체를 한 번에 재집계한다.
   *
   * **직전 구간과 진행 중 구간을 모두 쓴다.** 직전 구간은 확정(잠금) 대상이고, 진행 중
   * 구간은 화면이 "지금까지"를 보여줄 때 쓰인다. 직전 구간만 쓰면 배치가 늦게 도는 날
   * 그 구간의 확정이 밀린다.
   */
  async recomputeAll(now: Date): Promise<void> {
    const currentWeek = toCurrentWeekStart(now);
    const previousWeek = shiftWeekStart(currentWeek, -1);
    const currentMonth = toMonthStart(now);
    const previousMonth = shiftMonthStart(currentMonth, -1);

    const jobs: {
      type: StatsPeriodType;
      start: string;
      end: string;
      isFinal: boolean;
    }[] = [
      // 끝난 구간 — 확정해 잠근다
      {
        type: StatsPeriodType.WEEK,
        start: previousWeek,
        end: currentWeek,
        isFinal: true,
      },
      {
        type: StatsPeriodType.MONTH,
        start: previousMonth,
        end: currentMonth,
        isFinal: true,
      },
      // 진행 중 구간 — 잠그지 않는다. 다음 배치가 다시 덮어쓴다
      {
        type: StatsPeriodType.WEEK,
        start: currentWeek,
        end: shiftWeekStart(currentWeek, 1),
        isFinal: false,
      },
      {
        type: StatsPeriodType.MONTH,
        start: currentMonth,
        end: shiftMonthStart(currentMonth, 1),
        isFinal: false,
      },
    ];

    for (const job of jobs) {
      const rowCount = await this.repository.recompute(
        job.type,
        job.start,
        job.end,
        job.isFinal,
      );

      this.logger.log('content stats recomputed', {
        period_type: job.type,
        period_start: job.start,
        is_final: job.isFinal,
        row_count: rowCount,
      });
    }

    /**
     * **`all` 은 원천이 아니라 위에서 갱신한 `month` 행의 합이다**(KAN-57 — 리포지터리 주석).
     * 반드시 month 재집계 **뒤에** 부른다. 원천에서 다시 세면 보존 기간이 짧은 신호 계열만
     * 180일로 잘려 완청률이 실제보다 낮아진다.
     */
    const all = await this.repository.recomputeAllFromMonths(
      ALL_TIME_PERIOD_START,
    );

    this.logger.log('content stats recomputed', {
      period_type: StatsPeriodType.ALL,
      period_start: ALL_TIME_PERIOD_START,
      is_final: false,
      row_count: all.rowCount,
      source: 'month_sum',
    });

    /**
     * 빠진 달이 있으면 그만큼 `all` 이 적게 잡힌다. 배치가 한 달 넘게 멈추면 `recomputeAll` 이
     * 직전·진행 중 두 달만 다루므로 그 달 행이 **영영 생기지 않는다** — 종전에는 매일 원천에서
     * 다시 세어 저절로 메워지던 것이 이 변경 뒤에는 영구 오차가 된다. 그래서 세어서 남긴다.
     */
    if (all.contentsWithGap > 0) {
      this.logger.warn('content stats all-period has missing month rows', {
        contents_with_gap: all.contentsWithGap,
        hint: '배치가 멈춘 달이 있는지 확인한다 — 원천이 살아 있는 동안(180일) 그 달을 재집계하면 복구된다',
      });
    }
  }
}

/** 그 달의 1일 라벨 — 04시 경계를 거친 서비스 날짜 기준이다(domain.md 1.2) */
function toMonthStart(date: Date): string {
  return `${toServiceDate(date).slice(0, 7)}-01`;
}

/** 월 라벨을 달 단위로 옮긴다. 음수면 과거로 간다 */
function shiftMonthStart(monthStart: string, months: number): string {
  const [year, month] = monthStart.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));

  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
