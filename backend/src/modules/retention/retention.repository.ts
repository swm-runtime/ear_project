import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { RetentionTable } from './retention.constant';

interface DeletedCountRow {
  deleted_count: number;
}

function toDeletedCount(result: unknown): number {
  if (!Array.isArray(result) || result.length === 0) {
    return 0;
  }

  const [row] = result as DeletedCountRow[];

  return row.deleted_count ?? 0;
}

/**
 * 보존 기간이 지난 행을 **배치 단위로** 지운다(`domain.md` 12.1).
 *
 * **Raw SQL을 쓴다**(architecture.md 3.4 — Repository 안에서만 작성하고 결과를 타입으로
 * 정의해 반환한다). 이유는 둘이다.
 *
 * 1. `LIMIT`이 붙은 `DELETE`는 TypeORM의 `delete()`로 표현할 수 없다. 배치로 끊는 것이
 *    이 배치의 요구사항 자체이므로(락·WAL — `retention.constant.ts`) 우회가 아니라 필수다.
 * 2. `notification_logs`에는 **Entity가 없다.** `domain.md` 9.1이 정의하고 스키마에도
 *    있지만 아직 이 테이블을 쓰는 기능 코드가 없어 Entity를 만들지 않았다. Entity 기반
 *    삭제로는 네 테이블을 같은 코드로 다룰 수 없다.
 *
 * 테이블 이름은 `RetentionTable` 유니온이라 컴파일 시점에 네 값으로 고정된다 —
 * 사용자 입력이 식별자 자리에 오는 경로가 없다. 경계 시각·배치 크기는 바인딩 파라미터다.
 */
@Injectable()
export class RetentionRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * `created_at < cutoff`인 행을 최대 `limit`개 지우고 **실제로 지운 수**를 돌려준다.
   *
   * 지울 대상을 먼저 뽑아 PK로 지운다. `DELETE ... LIMIT`이 Postgres에 없기도 하고,
   * `ORDER BY created_at`으로 **가장 오래된 것부터** 인덱스 범위 조회로 집어야
   * 매 배치가 같은 비용으로 끝난다.
   *
   * `RETURNING`을 CTE로 감싸 개수만 받는다 — 만 건의 id를 애플리케이션까지 실어 올 이유가 없다.
   */
  async deleteCreatedBefore(
    table: RetentionTable,
    cutoff: Date,
    limit: number,
  ): Promise<number> {
    const result: unknown = await this.dataSource.query(
      `WITH deleted AS (
         DELETE FROM "${table}"
          WHERE "id" IN (
            SELECT "id" FROM "${table}"
             WHERE "created_at" < $1
             ORDER BY "created_at"
             LIMIT $2
          )
        RETURNING 1
       )
       SELECT COUNT(*)::int AS deleted_count FROM deleted`,
      [cutoff, limit],
    );

    return toDeletedCount(result);
  }
}
