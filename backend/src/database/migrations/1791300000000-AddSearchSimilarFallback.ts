import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 검색 유사 결과 폴백(KAN-238 — `changes/pending/search-similar-fallback.md`, domain.md 5.1·5.7).
 *
 * 부분 일치(ILIKE)가 0건이면 **자모로 푼 질의**와 제목·태그의 `pg_trgm` `word_similarity`로 비슷한 결과를 낸다.
 * 한글은 자모 하나가 틀리면 음절이 통째로 바뀌어("커리오" ↔ "커리어") 음절 트라이그램으로는 유사도가 안 나온다 —
 * 자모로 풀면(ㅋㅓㄹㅣㅇㅗ ↔ ㅋㅓㄹㅣㅇㅓ) 한 자모 차이가 된다.
 *
 * 1. 함수 `hangul_to_jamo(text)` — 완성형 음절(U+AC00~U+D7A3)을 초·중·종성 호환 자모로 풀고, 겹모음(ㅘ=ㅗ+ㅏ)·겹받침
 *    (ㄺ=ㄹ+ㄱ)은 **치는 순서대로** 푼다. 음절이 아닌 홀겹자모(조합 중의 "ㅘ"·"ㄳ")도 같게 풀고 나머지 문자는 그대로 둔다.
 *    `search-text.util.ts` `toJamo`(검색 로그 묶음 판정)와 같은 규칙이고, 동치는 e2e가 실제 DB 위에서 대조한다.
 *    - **IMMUTABLE**이어야 생성 컬럼·인덱스에 쓸 수 있다. 입력 문자열과 상수 배열만 보므로 결정적이다.
 *    - `SET search_path = pg_catalog` — 호출한 세션의 `search_path`와 무관하게 내장 함수(`ascii`·`substr`)만 해석한다.
 *    - STRICT — NULL은 NULL. 생성식은 `coalesce`로 NULL을 넣지 않는다.
 * 2. `contents.search_jamo` — `hangul_to_jamo(lower(title) || ' ' || coalesce(tags::text, ''))` STORED 생성 컬럼.
 *    인덱스가 필요한 파생값이라 "파생값을 컬럼으로 두지 않는다"(domain.md 1.5)의 예외이고, 생성 컬럼이라 원본과 어긋날 수 없다.
 *    **함수가 먼저 있어야 컬럼을 만들 수 있다** — down은 인덱스·컬럼을 지운 뒤 함수를 지운다.
 *    엔티티에는 선언하지 않는다 — 앱이 읽거나 쓰지 않고(조회 식 안에서만 쓴다), 생성 컬럼은 INSERT·UPDATE 대상이 될 수 없다.
 * 3. `idx_contents_search_jamo_trgm` GIN(gin_trgm_ops).
 * 4. `search_query_logs.similar_count smallint NULL` — 폴백이 돌았을 때 첫 페이지 건수. NULL = 돌지 않았다(옛 행 포함).
 *
 * 운영 안전성:
 * - `pg_trgm`은 `AddSearchTrgmIndexes1786300200000`이 이미 만들었다. `IF NOT EXISTS`라 여기서는 아무것도 하지 않는다.
 * - `contents`는 운영 수백 행이라 STORED 컬럼 추가(표 재작성)·인덱스 생성이 즉시 끝난다. `search_query_logs`는 기본값 없는
 *   NULL 열 추가라 표를 다시 쓰지 않는다.
 * - 운영→개발계 콘텐츠 동기화: `pg_dump --column-inserts`는 생성 컬럼을 덤프하지 않고(PG 12+), 들여오기의 upsert 열 목록은
 *   `public` 쪽 생성 컬럼을 뺀다(`deploy/sync-content-import.sh`, 같은 PR).
 */
export class AddSearchSimilarFallback1791300000000 implements MigrationInterface {
  name = 'AddSearchSimilarFallback1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
      CREATE FUNCTION "hangul_to_jamo"(input text) RETURNS text
        LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
        SET search_path = pg_catalog
      AS $fn$
      DECLARE
        cho CONSTANT text[] := ARRAY['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']::text[];
        jung CONSTANT text[] := ARRAY['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ']::text[];
        jong CONSTANT text[] := ARRAY['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']::text[];
        result text := '';
        ch text;
        code integer;
        syllable integer;
      BEGIN
        FOR i IN 1 .. char_length(input) LOOP
          ch := substr(input, i, 1);
          code := ascii(ch);
          IF code BETWEEN 44032 AND 55203 THEN
            syllable := code - 44032;
            result := result || cho[syllable / 588 + 1] || jung[(syllable / 28) % 21 + 1] || jong[syllable % 28 + 1];
          ELSE
            result := result || CASE ch
              WHEN 'ㅘ' THEN 'ㅗㅏ'
              WHEN 'ㅙ' THEN 'ㅗㅐ'
              WHEN 'ㅚ' THEN 'ㅗㅣ'
              WHEN 'ㅝ' THEN 'ㅜㅓ'
              WHEN 'ㅞ' THEN 'ㅜㅔ'
              WHEN 'ㅟ' THEN 'ㅜㅣ'
              WHEN 'ㅢ' THEN 'ㅡㅣ'
              WHEN 'ㄳ' THEN 'ㄱㅅ'
              WHEN 'ㄵ' THEN 'ㄴㅈ'
              WHEN 'ㄶ' THEN 'ㄴㅎ'
              WHEN 'ㄺ' THEN 'ㄹㄱ'
              WHEN 'ㄻ' THEN 'ㄹㅁ'
              WHEN 'ㄼ' THEN 'ㄹㅂ'
              WHEN 'ㄽ' THEN 'ㄹㅅ'
              WHEN 'ㄾ' THEN 'ㄹㅌ'
              WHEN 'ㄿ' THEN 'ㄹㅍ'
              WHEN 'ㅀ' THEN 'ㄹㅎ'
              WHEN 'ㅄ' THEN 'ㅂㅅ'
              ELSE ch
            END;
          END IF;
        END LOOP;
        RETURN result;
      END
      $fn$`);
    await queryRunner.query(
      `ALTER TABLE "contents" ADD "search_jamo" text GENERATED ALWAYS AS (hangul_to_jamo(lower("title") || ' ' || coalesce("tags"::text, ''))) STORED`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contents_search_jamo_trgm" ON "contents" USING GIN ("search_jamo" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_query_logs" ADD "similar_count" smallint`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_query_logs" DROP COLUMN "similar_count"`,
    );
    await queryRunner.query(`DROP INDEX "idx_contents_search_jamo_trgm"`);
    await queryRunner.query(`ALTER TABLE "contents" DROP COLUMN "search_jamo"`);
    await queryRunner.query(`DROP FUNCTION "hangul_to_jamo"(text)`);
  }
}
