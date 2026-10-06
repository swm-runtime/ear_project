import { Injectable, Logger } from '@nestjs/common';

import { SlackAlertService } from '@/modules/alert/slack-alert.service';

import { Ga4RealtimeClient, RealtimeEventMinute } from './ga4-realtime.client';
import {
  APP_REMOVE_EVENT_NAME,
  GA4_REALTIME_SETTLE_MINUTES,
} from './voc.constant';

const MINUTE_MS = 60 * 1000;

const KST_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 한 주기에서 새로 집계한 것 — 순수 함수 `selectNewMinutes`의 결과 */
export interface AppRemoveBatch {
  /** 플랫폼별 건수(GA4 `platform` 값 그대로 — 지금은 Android 만 올라온다) */
  countsByPlatform: Record<string, number>;
  total: number;
  /** 집계한 분의 범위(절대 분, epoch 분) — 비어 있으면 null */
  fromMinute: number | null;
  toMinute: number | null;
  /** 이번 주기 뒤의 "마지막으로 집계한 분" */
  lastProcessedMinute: number;
}

/**
 * 앱 삭제 Slack 알림(`features/backend-monitoring.md` 3-4, 2026-10-06).
 *
 * Firebase 가 Android 에서 자동 수집하는 `app_remove`를 GA4 실시간 보고로 15분마다 읽어, 새로 도착한 건수가 있으면
 * Slack 한 줄로 알린다. 탈퇴 버튼을 누르지 않고 앱만 지우는 "준탈퇴"를 그날 안에 보기 위해서다. **누가** 지웠는지는
 * 싣지 않는다 — 실시간 보고에 사용자 식별자가 없고, 있어도 Slack 에는 신원 값을 쓰지 않는다(CLAUDE.md).
 *
 * **같은 분을 두 번 세지 않는다.** 실시간 보고는 매 호출마다 최근 30분을 통째로 돌려주므로, "마지막으로 집계한
 * 분"(epoch 분)을 메모리에 들고 그보다 새 분만 더한다. 막 도착한 분(`GA4_REALTIME_SETTLE_MINUTES` 안)은 아직
 * 채워지는 중일 수 있어 다음 주기로 미룬다. 기록은 프로세스 메모리라 **재배포 뒤 첫 주기는 보이는 30분 창을
 * 전부 집계한다** — 직전 프로세스가 이미 알린 분이 섞여 한 번 중복될 수 있다. 놓치는 것보다 낫다고 봤고, 배포는
 * 하루 몇 번이다.
 *
 * iOS 는 Apple 이 삭제 이벤트를 주지 않아 여기서 잡히지 않는다 — 푸시 토큰 무효화(`device_tokens.invalidated_at`)가
 * 그쪽의 유일한 신호다.
 */
@Injectable()
export class AppRemoveAlertService {
  private readonly logger = new Logger(AppRemoveAlertService.name);
  private lastProcessedMinute: number | null = null;

  constructor(
    private readonly ga4RealtimeClient: Ga4RealtimeClient,
    private readonly slackAlertService: SlackAlertService,
  ) {}

  /** GA4 자격과 웹훅이 모두 있어야 돈다 */
  get configured(): boolean {
    return this.ga4RealtimeClient.configured && this.slackAlertService.enabled;
  }

  async poll(now: Date): Promise<AppRemoveBatch> {
    const minutes = await this.ga4RealtimeClient.fetchEventMinutes(
      APP_REMOVE_EVENT_NAME,
    );
    const batch = selectNewMinutes(minutes, now, this.lastProcessedMinute);
    this.lastProcessedMinute = batch.lastProcessedMinute;

    if (batch.total === 0) {
      return batch;
    }

    this.slackAlertService.notify(
      'app-remove',
      formatAppRemoveText(batch, now),
    );
    this.logger.log('app remove alert sent', {
      total: batch.total,
      by_platform: batch.countsByPlatform,
      from_minute: batch.fromMinute,
      to_minute: batch.toMinute,
    });

    return batch;
  }
}

/**
 * 실시간 보고의 분 단위 행 중 **아직 집계하지 않았고 충분히 지난** 분만 더한다. 순수 함수라 서비스 없이 검증한다.
 *
 * - `minutesAgo`는 요청 시점 기준이므로 절대 분 = `floor(now/분) - minutesAgo`
 * - 집계 상한은 `floor(now/분) - SETTLE` — 그보다 새 분은 다음 주기
 * - `lastProcessedMinute`가 `null`(첫 주기)이면 보이는 창을 전부 집계한다(클래스 주석)
 */
export function selectNewMinutes(
  minutes: readonly RealtimeEventMinute[],
  now: Date,
  lastProcessedMinute: number | null,
): AppRemoveBatch {
  const nowMinute = Math.floor(now.getTime() / MINUTE_MS);
  const ceiling = nowMinute - GA4_REALTIME_SETTLE_MINUTES;
  const countsByPlatform: Record<string, number> = {};
  let total = 0;
  let fromMinute: number | null = null;
  let toMinute: number | null = null;

  for (const entry of minutes) {
    const absolute = nowMinute - entry.minutesAgo;

    if (absolute > ceiling) continue;
    if (lastProcessedMinute !== null && absolute <= lastProcessedMinute) {
      continue;
    }

    countsByPlatform[entry.platform] =
      (countsByPlatform[entry.platform] ?? 0) + entry.count;
    total += entry.count;
    fromMinute =
      fromMinute === null ? absolute : Math.min(fromMinute, absolute);
    toMinute = toMinute === null ? absolute : Math.max(toMinute, absolute);
  }

  return {
    countsByPlatform,
    total,
    fromMinute,
    toMinute,
    // 집계한 것이 없어도 상한까지는 본 것이다 — 다음 주기가 같은 빈 분을 다시 뒤지지 않는다
    lastProcessedMinute: Math.max(ceiling, lastProcessedMinute ?? ceiling),
  };
}

/**
 * 한 줄: `:wastebasket: 앱 삭제 N건 · Android · HH:mm~HH:mm KST (GA4 app_remove)`.
 * 플랫폼이 둘 이상이면 `Android 2 · iOS 1`처럼 나열한다. 시각은 GA4 도착 분 기준이다.
 */
export function formatAppRemoveText(batch: AppRemoveBatch, now: Date): string {
  const platforms = Object.entries(batch.countsByPlatform)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([platform, count]) =>
      Object.keys(batch.countsByPlatform).length === 1
        ? platform
        : `${platform} ${count}`,
    )
    .join(' · ');
  const from = KST_TIME.format(
    new Date(
      (batch.fromMinute ?? Math.floor(now.getTime() / MINUTE_MS)) * MINUTE_MS,
    ),
  );
  const to = KST_TIME.format(
    new Date(((batch.toMinute ?? batch.fromMinute ?? 0) + 1) * MINUTE_MS),
  );

  return `:wastebasket: 앱 삭제 ${batch.total}건 · ${platforms} · ${from}~${to} KST (GA4 app_remove)`;
}
