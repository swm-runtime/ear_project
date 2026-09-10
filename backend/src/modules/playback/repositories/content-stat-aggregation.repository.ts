import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * `content_stats` 재집계(domain.md 5.4).
 *
 * **증분이 아니라 재집계 upsert다** — 원천에서 구간을 다시 세어 통째로 덮어쓴다.
 * "배치가 두 번 돌아도 결과가 같아야 한다"가 이 방식의 이유이고, 증분(`play_count += 1`)은
 * 재실행 한 번에 값이 두 배가 된다.
 *
 * 집계는 **한 문장으로** 끝낸다. 콘텐츠를 순회하며 세면 카탈로그 크기만큼 왕복이 생기고,
 * 그 사이에 들어온 재생이 구간에 반쯤 섞인다.
 */
@Injectable()
export class ContentStatAggregationRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * `[periodStart, periodEnd)` 구간을 재집계해 upsert 한다. 반환값은 쓴 행 수다.
   *
   * **`is_final = true` 행은 건드리지 않는다**(5.4 — "구간이 끝나면 잠근다. 이후 재집계
   * 배치는 이 행을 건드리지 않는다"). 정산·리포팅이 그 행을 읽기 때문에, 나중에 원천이
   * 바뀌어도 확정값이 흔들리면 안 된다.
   *
   * 경계는 **서비스 날짜 라벨**로 비교한다(04시 경계 — domain.md 1.2). `play_records`는
   * `play_date`가 이미 라벨이고, 나머지는 **라벨 경계를 `timestamptz`로 환산해** `created_at`과
   * 직접 비교한다 — 행마다 `created_at`을 라벨로 바꿔 비교하면(`SERVICE_DATE_OF(created_at)`)
   * 인덱스를 못 타고 `user_signals`·`source_link_clicks` 전체를 매일 세 번 훑는다
   * (2026-09-09 감사). 경계를 상수로 계산하면 같은 구간을 인덱스 범위 조회로 읽는다.
   */
  async recompute(
    periodType: 'week' | 'month' | 'all',
    periodStart: string,
    periodEndExclusive: string,
    isFinal: boolean,
  ): Promise<number> {
    const result: unknown = await this.dataSource.query(
      `
      WITH plays AS (
        SELECT content_id,
               COUNT(*)                   AS play_count,
               COALESCE(SUM(listened_sec), 0) AS total_listen_sec
        FROM play_records
        WHERE play_date >= $2::date AND play_date < $3::date
        GROUP BY content_id
      ),
      signals AS (
        SELECT content_id,
               COUNT(*) FILTER (WHERE action = 'complete') AS complete_count,
               COUNT(*) FILTER (WHERE action = 'replay')   AS replay_count,
               COUNT(*) FILTER (WHERE action = 'save')     AS save_count
        FROM user_signals
        WHERE created_at >= ${SERVICE_DATE_START_OF('$2')}
          AND created_at < ${SERVICE_DATE_START_OF('$3')}
        GROUP BY content_id
      ),
      clicks AS (
        SELECT content_id, COUNT(*) AS source_link_click_count
        FROM source_link_clicks
        WHERE created_at >= ${SERVICE_DATE_START_OF('$2')}
          AND created_at < ${SERVICE_DATE_START_OF('$3')}
        GROUP BY content_id
      ),
      merged AS (
        SELECT content_id FROM plays
        UNION SELECT content_id FROM signals
        UNION SELECT content_id FROM clicks
      )
      INSERT INTO content_stats (
        content_id, period_type, period_start,
        play_count, complete_count, replay_count,
        total_listen_sec, save_count, source_link_click_count, is_final
      )
      SELECT m.content_id, $1, $2::date,
             COALESCE(p.play_count, 0),
             COALESCE(s.complete_count, 0),
             COALESCE(s.replay_count, 0),
             COALESCE(p.total_listen_sec, 0),
             COALESCE(s.save_count, 0),
             COALESCE(c.source_link_click_count, 0),
             $4
      FROM merged m
      LEFT JOIN plays   p ON p.content_id = m.content_id
      LEFT JOIN signals s ON s.content_id = m.content_id
      LEFT JOIN clicks  c ON c.content_id = m.content_id
      ON CONFLICT (content_id, period_type, period_start) DO UPDATE SET
        play_count              = EXCLUDED.play_count,
        complete_count          = EXCLUDED.complete_count,
        replay_count            = EXCLUDED.replay_count,
        total_listen_sec        = EXCLUDED.total_listen_sec,
        save_count              = EXCLUDED.save_count,
        source_link_click_count = EXCLUDED.source_link_click_count,
        is_final                = EXCLUDED.is_final,
        updated_at              = now()
      WHERE content_stats.is_final = false
      `,
      [periodType, periodStart, periodEndExclusive, isFinal],
    );

    /**
     * TypeORM의 `query`는 INSERT에서 `[rows, affectedCount]`를 준다. 형태가 드라이버에
     * 달려 있어 방어적으로 읽는다 — **이 값은 로그용이고 판정에 쓰지 않는다.**
     */
    return Array.isArray(result) && typeof result[1] === 'number'
      ? result[1]
      : 0;
  }
}

/**
 * 서비스 날짜 라벨(`date` 파라미터) → 그 날짜가 **시작되는 순간**의 `timestamptz`
 * (KST 04:00). `service-date.util`이 애플리케이션에서 하는 `(kst - 4h)::date`의 역함수다 —
 * 두 곳의 경계가 갈리면 집계와 판정이 어긋나므로 같은 상수(4시간·Asia/Seoul)를 쓴다.
 *
 * `timestamp AT TIME ZONE 'Asia/Seoul'`은 tz 없는 시각을 KST로 해석해 `timestamptz`로
 * 바꾼다(`timestamptz AT TIME ZONE`과 방향이 반대다 — 여기 입력은 `date + interval`이라
 * tz 없는 쪽이다).
 */
function SERVICE_DATE_START_OF(dateParam: string): string {
  return `((${dateParam}::date + INTERVAL '4 hours') AT TIME ZONE 'Asia/Seoul')`;
}
