import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 검색 오타 교정 + 하이브리드(KAN-238 — `changes/pending/search-similar-fallback.md`, domain.md 5.1·5.7).
 *
 * 1. 함수 `hangul_to_jamo(text)` — 완성형 음절(U+AC00~U+D7A3)을 초·중·종성 호환 자모로 풀고, 겹모음(ㅘ=ㅗ+ㅏ)·겹받침
 *    (ㄺ=ㄹ+ㄱ)은 **치는 순서대로** 푼다. 음절이 아닌 홀겹자모(조합 중의 "ㅘ"·"ㄳ")도 같게 풀고 나머지 문자는 그대로 둔다.
 *    교정어 선택(`ContentRepository.findSearchCorrection`)이 질의·어휘 양쪽을 이 함수로 풀어 `word_similarity`를 잰다 —
 *    한글은 자모 하나가 틀리면 음절이 통째로 바뀌어("커리오" ↔ "커리어") 음절 트라이그램으로는 유사도가 안 나온다.
 *    `search-text.util.ts` `toJamo`(검색 로그 묶음 판정)와 같은 규칙이고, 동치는 e2e가 실제 DB 위에서 대조한다.
 *    - IMMUTABLE — 입력 문자열과 상수 배열만 본다(결정적). 지금은 컬럼·인덱스에 쓰지 않지만, 어휘가 커져 `search_terms`
 *      머티리얼라이즈드 뷰 + trgm 인덱스로 갈 때 그대로 인덱스 식에 쓸 수 있다.
 *    - `SET search_path = pg_catalog` — 호출한 세션의 `search_path`와 무관하게 내장 함수(`ascii`·`substr`)만 해석한다.
 *    - STRICT — NULL은 NULL.
 * 2. `search_query_logs`에 `query_used varchar(100)`(실제 검색어 — 교정어 또는 원문), `keyword_count smallint`(첫 페이지 중
 *    키워드로 맞은 건수), `engines text[]`(응답을 만든 엔진). 전부 NULL 허용 — **NULL은 이 기능 전의 옛 행**이다.
 *
 * 컬럼·인덱스를 `contents`에 두지 않는다(02:48 안의 자모 생성 컬럼·GIN을 걷었다) — 교정어 어휘는 질의 시 전수 비교한다.
 *
 * 운영 안전성:
 * - `pg_trgm`(`word_similarity`)은 `AddSearchTrgmIndexes1786300200000`이 이미 만들었다. `IF NOT EXISTS`라 여기서는 아무것도 하지 않는다.
 * - `search_query_logs`의 세 열은 기본값 없는 NULL 열 추가라 표를 다시 쓰지 않는다(메타데이터만 — 잠금 순간).
 * - 함수 생성은 다른 객체에 의존하지 않는다. down은 열을 지운 뒤 함수를 지운다(함수를 쓰는 저장 객체는 없다).
 * - 운영→개발계 콘텐츠 동기화(`deploy/sync-content-import.sh`)는 `contents`만 옮기므로 영향이 없다.
 */
export class AddSearchCorrectionHybrid1791300000000 implements MigrationInterface {
  name = 'AddSearchCorrectionHybrid1791300000000';

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
      `ALTER TABLE "search_query_logs" ADD "query_used" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_query_logs" ADD "keyword_count" smallint`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_query_logs" ADD "engines" text array`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_query_logs" DROP COLUMN "engines"`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_query_logs" DROP COLUMN "keyword_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_query_logs" DROP COLUMN "query_used"`,
    );
    await queryRunner.query(`DROP FUNCTION "hangul_to_jamo"(text)`);
  }
}
