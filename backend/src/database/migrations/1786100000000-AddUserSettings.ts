import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * domain.md 3.5 — `user` 모듈이 소유하는 사용자 설정 테이블.
 *
 * **네 개로 나뉘어 있던 설정 테이블을 하나로 통합한 것**이다(B-1 결정 — domain.md 14장).
 * 설정 항목은 계속 늘어나는데 그때마다 테이블을 만들 수 없다.
 *
 * FK에 `ON DELETE CASCADE`를 건다. 탈퇴 시 즉시 파기 대상이며(domain.md 12.3),
 * `user-withdrawal.service.ts`가 남긴 TODO대로 **CASCADE를 걸면 탈퇴 코드에 손댈 필요가 없다.**
 *
 * `sleep_timer_last_choice`가 `varchar`인 이유는 domain.md 3.5가 `enum`이라고만 적고
 * **값 집합을 정하지 않았기** 때문이다(수면 타이머 P1). 값이 확정되면 좁힌다.
 */
export class AddUserSettings1786100000000 implements MigrationInterface {
  name = 'AddUserSettings1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_settings" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "default_playback_rate" double precision NOT NULL DEFAULT '1', "sleep_timer_last_choice" character varying(20), "is_auto_expand_enabled" boolean NOT NULL DEFAULT true, "is_drip_notification_enabled" boolean NOT NULL DEFAULT true, CONSTRAINT "uq_user_settings_user_id" UNIQUE ("user_id"), CONSTRAINT "PK_00f004f5922a0744d174530d639" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD CONSTRAINT "fk_user_settings_users" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP CONSTRAINT "fk_user_settings_users"`,
    );
    await queryRunner.query(`DROP TABLE "user_settings"`);
  }
}
