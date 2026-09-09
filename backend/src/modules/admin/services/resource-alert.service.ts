import { readFile } from 'node:fs/promises';

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { EnvironmentVariables } from '@/config/env.validation';

import {
  cpuPercentBetween,
  parseMeminfo,
  parseProcStatCpu,
} from './admin-system-stats.service';

/**
 * 서버 자원 임계 감시 → Slack — **API 서버 안에 상주하는 부가 모듈이다**
 * (features/backend-monitoring.md 5장, 사용자 결정 2026-09-06).
 *
 * 콘솔 상태 탭이 "열 때 1회" 스냅샷으로 바뀌면서, 지속 감시는 화면이 아니라 여기가
 * 맡는다 — CPU 70%·메모리 80% 를 넘으면 Slack 으로 알린다. DB 는 조회하지 않는다
 * (/proc 읽기뿐이라 감시 자체가 부하를 만들지 않는다).
 *
 * 샘플은 알림 여부와 무관하게 **항상** 60초마다 쌓는다(HISTORY_MAX 개 링 버퍼) —
 * 대시보드의 CPU/메모리 시간축 그래프가 이 이력을 읽는다(`GET /admin/system-stats`).
 * DB 에 쓰지 않고 프로세스 메모리에만 들므로 재기동(배포) 시 비워진다.
 *
 * 격리 원칙 — 어떤 상태여도 API 서빙에 영향이 없다:
 * - 자체 setInterval(unref) · 전부 try/catch — 실패는 로그 한 줄로 끝난다
 * - `SLACK_ERROR_WEBHOOK_URL` 이 없으면(로컬) 알림만 꺼진다 — 샘플링은 계속한다
 *
 * 알림 판정(AlertJudge) — 스파이크 오탐과 도배를 막는다:
 * - 60초 틱 3회 연속 초과 시에만 발보 (≈3분 지속)
 * - 지속 중 재알림은 30분에 한 번
 * - 3회 연속 정상 복귀 시 해제 알림 1회
 */
const TICK_MS = 60_000;
const CPU_SAMPLE_MS = 300;
export const CPU_ALERT_PERCENT = 70;
export const MEM_ALERT_PERCENT = 80;
const SUSTAIN_TICKS = 3;
const REALERT_MS = 30 * 60_000;
/** Slack webhook 응답 대기 상한 — 감시 주기(TICK_MS)보다 충분히 짧아야 다음 표본이 밀리지 않는다 */
const SLACK_WEBHOOK_TIMEOUT_MS = 5_000;

type MetricState = {
  breaches: number;
  normals: number;
  alarmed: boolean;
  lastAlertAt: number;
};

export type AlertEvent = {
  metric: 'cpu' | 'memory';
  kind: 'alert' | 'realert' | 'recovered';
  value: number;
};

/** 60초 틱마다 쌓는 자원 샘플 — 대시보드 시간축 그래프의 원천 */
export type ResourceSample = {
  t: number;
  cpuUsedPercent: number | null;
  memUsedPercent: number | null;
  /** pg_stat_activity 의 현재 DB 접속 수 — 조회 실패 시 null */
  dbConnTotal: number | null;
};

/** 6시간(60초 × 360) — 프로세스 메모리에만 든다. 재기동(배포)하면 비워진다 */
const HISTORY_MAX = 360;

/** 임계 판정 상태 기계 — 순수 로직이라 서비스와 분리해 테스트한다 */
export class AlertJudge {
  private readonly states: Record<'cpu' | 'memory', MetricState> = {
    cpu: { breaches: 0, normals: 0, alarmed: false, lastAlertAt: 0 },
    memory: { breaches: 0, normals: 0, alarmed: false, lastAlertAt: 0 },
  };

  constructor(
    private readonly thresholds: Record<'cpu' | 'memory', number>,
    private readonly sustainTicks = SUSTAIN_TICKS,
    private readonly realertMs = REALERT_MS,
  ) {}

  update(
    values: { cpu: number | null; memory: number | null },
    now: number,
  ): AlertEvent[] {
    const events: AlertEvent[] = [];

    for (const metric of ['cpu', 'memory'] as const) {
      const value = values[metric];
      if (value === null) continue; // 못 읽은 틱은 판정에 넣지 않는다

      const state = this.states[metric];

      if (value >= this.thresholds[metric]) {
        state.breaches += 1;
        state.normals = 0;

        if (!state.alarmed && state.breaches >= this.sustainTicks) {
          state.alarmed = true;
          state.lastAlertAt = now;
          events.push({ metric, kind: 'alert', value });
        } else if (state.alarmed && now - state.lastAlertAt >= this.realertMs) {
          state.lastAlertAt = now;
          events.push({ metric, kind: 'realert', value });
        }
      } else {
        state.breaches = 0;
        state.normals += 1;

        if (state.alarmed && state.normals >= this.sustainTicks) {
          state.alarmed = false;
          events.push({ metric, kind: 'recovered', value });
        }
      }
    }

    return events;
  }
}

@Injectable()
export class ResourceAlertService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceAlertService.name);
  private readonly judge = new AlertJudge({
    cpu: CPU_ALERT_PERCENT,
    memory: MEM_ALERT_PERCENT,
  });
  private timer: NodeJS.Timeout | undefined;
  private readonly webhookUrl: string;
  private readonly samples: ResourceSample[] = [];

  constructor(
    configService: ConfigService<EnvironmentVariables, true>,
    private readonly dataSource: DataSource,
  ) {
    this.webhookUrl =
      configService.get('SLACK_ERROR_WEBHOOK_URL', { infer: true }) ?? '';
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();

    if (this.webhookUrl) {
      this.logger.log('resource alert on', {
        cpu_percent: CPU_ALERT_PERCENT,
        mem_percent: MEM_ALERT_PERCENT,
      });
    } else {
      this.logger.log('resource alert off (no webhook url) — sampling only');
    }
  }

  /** 최신순 아님 — 오래된 것부터. 배열 복사본이라 호출자가 건드려도 무방하다 */
  history(): ResourceSample[] {
    return [...this.samples];
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      const [cpu, memory, dbConn] = await Promise.all([
        this.sampleCpuPercent(),
        this.sampleMemUsedPercent(),
        this.sampleDbConnections(),
      ]);

      this.samples.push({
        t: Date.now(),
        cpuUsedPercent: cpu,
        memUsedPercent: memory,
        dbConnTotal: dbConn,
      });
      if (this.samples.length > HISTORY_MAX) this.samples.shift();

      if (!this.webhookUrl) return;
      for (const event of this.judge.update({ cpu, memory }, Date.now())) {
        await this.postToSlack(event);
      }
    } catch (error) {
      // 감시 실패는 API 서빙과 무관 — 조용히 다음 틱을 기다린다
      this.logger.warn('resource alert tick failed', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async sampleCpuPercent(): Promise<number | null> {
    try {
      const first = parseProcStatCpu(await readFile('/proc/stat', 'utf8'));
      await new Promise((resolve) => setTimeout(resolve, CPU_SAMPLE_MS));
      const second = parseProcStatCpu(await readFile('/proc/stat', 'utf8'));
      return cpuPercentBetween(first, second);
    } catch {
      return null;
    }
  }

  private async sampleMemUsedPercent(): Promise<number | null> {
    try {
      const meminfo = parseMeminfo(await readFile('/proc/meminfo', 'utf8'));
      if (!meminfo || meminfo.totalBytes === 0) return null;
      return (
        ((meminfo.totalBytes - meminfo.availableBytes) / meminfo.totalBytes) *
        100
      );
    } catch {
      return null;
    }
  }

  /** 접속 수 하나만 — 60초마다 도는 조회라 pg_stat_activity 집계 이상은 하지 않는다 */
  private async sampleDbConnections(): Promise<number | null> {
    try {
      const [row] = await this.dataSource.query<{ total: number }[]>(
        `select count(*)::int as total from pg_stat_activity where datname = current_database()`,
      );
      return row.total;
    } catch {
      return null;
    }
  }

  private async postToSlack(event: AlertEvent): Promise<void> {
    const label = event.metric === 'cpu' ? 'CPU' : '메모리';
    const threshold =
      event.metric === 'cpu' ? CPU_ALERT_PERCENT : MEM_ALERT_PERCENT;
    const text =
      event.kind === 'recovered'
        ? `:white_check_mark: *API 서버 ${label} 정상화* — 현재 ${event.value.toFixed(0)}%`
        : `:rotating_light: *API 서버 ${label} ${event.value.toFixed(0)}%* — 임계 ${threshold}% ${
            event.kind === 'realert' ? '초과 지속 중' : '3분 이상 초과'
          }`;

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      // Slack이 응답을 안 주면 감시 주기 안에서 끊는다 — 상한 없는 fetch는 다음 표본까지 막는다
      signal: AbortSignal.timeout(SLACK_WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`slack webhook ${res.status}`);
  }
}
