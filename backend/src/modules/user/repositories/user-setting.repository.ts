import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserSetting } from '../entities/user-setting.entity';

@Injectable()
export class UserSettingRepository {
  constructor(
    @InjectRepository(UserSetting)
    private readonly repository: Repository<UserSetting>,
  ) {}

  private scoped(manager?: EntityManager): Repository<UserSetting> {
    return manager ? manager.getRepository(UserSetting) : this.repository;
  }

  /** 행이 없는 사용자가 정상이다(domain.md 3.5) — 없으면 `null`이고 호출부가 기본값을 만든다 */
  async findByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserSetting | null> {
    return this.scoped(manager).findOneBy({ userId });
  }

  /**
   * 부분 갱신 upsert. **행이 없으면 만들고 있으면 보낸 컬럼만 바꾼다**
   * (`settings-api.md` 4.2 서버 처리).
   *
   * `INSERT ... ON CONFLICT DO UPDATE`로 한 문장에 처리하는 이유는 조회 후 분기하면
   * 동시 요청 두 개가 모두 "행이 없다"를 보고 각자 INSERT 하기 때문이다.
   * `uq_user_settings_user_id`가 최종 방어이고, `orUpdate`가 그 충돌을 갱신으로 흡수한다
   * (architecture.md 8.4 — 판정은 애플리케이션, 최종 방어는 DB 제약).
   *
   * 보내지 않은 컬럼은 갱신 목록에 넣지 않으므로 **INSERT 시에는 DB 기본값이, UPDATE 시에는
   * 기존 값이** 남는다.
   */
  async upsert(
    userId: string,
    changes: Partial<UserSetting>,
    manager?: EntityManager,
  ): Promise<UserSetting> {
    const repository = this.scoped(manager);
    // `orUpdate`는 **DB 컬럼명**을 요구한다. 프로퍼티명을 그대로 넘기면
    // `column excluded.isDripNotificationEnabled does not exist`로 깨진다 —
    // 메타데이터로 변환해 Entity의 `@Column({ name })`과 어긋날 여지를 없앤다
    const columns = Object.keys(changes).map(
      (property) =>
        repository.metadata.findColumnWithPropertyName(property)!.databaseName,
    );

    if (columns.length > 0) {
      await repository
        .createQueryBuilder()
        .insert()
        .into(UserSetting)
        .values({ userId, ...changes })
        .orUpdate(columns, ['user_id'])
        .execute();
    }

    // 갱신 결과를 다시 읽는다 — 응답이 설정 전체를 되돌려야 하고(4.2), upsert의 RETURNING은
    // 갱신하지 않은 컬럼의 최종값을 보장하지 않는다
    const saved = await this.findByUserId(userId, manager);

    if (!saved) {
      throw new Error('user_settings upsert 직후 행을 찾을 수 없다');
    }

    return saved;
  }

  async deleteByUserId(userId: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ userId });
  }
}
