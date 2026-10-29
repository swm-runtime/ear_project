import {
  InsightsDripArrivalTimeArm,
  InsightsDripArrivalTimeKey,
  InsightsDripArrivalTimeRow,
} from '../admin.types';

/**
 * 도착 알림 시각 실험(`GET /admin/insights/drip-arrival-time`, KAN-289)의 순수 계산 — Repository 의 묶음 행을 늘 같은 네 행
 * (07:00 기준선 · 07:30 A · 08:00 B · 참고: 아침 알림)으로 펴고 재생률을 붙인다.
 */

export interface DripArrivalTimeArmSpec {
  key: InsightsDripArrivalTimeKey;
  sendTime: string;
  reference: boolean;
}

/** 분모가 0이면 null — 0%와 "보낸 게 없다"를 구분한다 */
function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** `specs` 순서대로 한 행씩 — 보낸 게 없는 묶음도 0건 · 비율 null 로 나온다 */
export function dripArrivalTimeArms(
  rows: InsightsDripArrivalTimeRow[],
  specs: DripArrivalTimeArmSpec[],
): InsightsDripArrivalTimeArm[] {
  return specs.map((spec) => {
    const row = rows.find((r) => r.key === spec.key);
    const sent = row?.sent ?? 0;
    const played2h = row?.played2h ?? 0;
    const playedSameDay = row?.playedSameDay ?? 0;
    return {
      key: spec.key,
      sendTime: spec.sendTime,
      reference: spec.reference,
      sent,
      users: row?.users ?? 0,
      played2h,
      playedSameDay,
      playRate2h: ratio(played2h, sent),
      playRateSameDay: ratio(playedSameDay, sent),
      firstSentAt: row?.firstSentAt ?? null,
      lastSentAt: row?.lastSentAt ?? null,
    };
  });
}
