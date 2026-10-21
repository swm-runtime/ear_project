import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `plans.name_en` · `description_en` (domain.md 8.1, 2026-10-16 — KAN-192 일부).
 *
 * 앱의 요금제 화면은 서버 문구(`name`·`description`)를 그대로 그린다. 그래서 GLOBAL 사용자에게도 "하루 5편까지 들을 수
 * 있어요" 같은 한국어가 보였다. 영어 문구를 같은 행에 두고, 서버가 사용자 시장으로 언어를 골라 내려준다. 별도 요금제
 * 행·스토어 상품은 만들지 않는다(같은 상품을 전 세계 현지가로 판다).
 *
 * 값은 지금 한도(light 2편 · daily 5편 · pro·trial 무제한)에 맞춘 문구다. 한도를 바꾸면 한국어 설명과 함께 고친다.
 */
export class AddPlanEnglishText1790400000000 implements MigrationInterface {
  name = 'AddPlanEnglishText1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plans" ADD "name_en" character varying(50)`,
    );
    await queryRunner.query(`ALTER TABLE "plans" ADD "description_en" text`);
    await queryRunner.query(
      `UPDATE "plans" AS p SET "name_en" = v.name_en, "description_en" = v.description_en
         FROM (VALUES
           ('light', 'Light', 'Listen to up to 2 episodes a day'),
           ('daily', 'Daily', 'Listen to up to 5 episodes a day'),
           ('pro', 'Pro', 'Listen as much as you like, with no daily limit'),
           ('trial', 'Free trial', 'Unlimited listening during your free trial')
         ) AS v(tier, name_en, description_en)
        WHERE p."tier" = v.tier`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "description_en"`);
    await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "name_en"`);
  }
}
