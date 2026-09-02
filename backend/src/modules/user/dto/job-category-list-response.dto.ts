/**
 * career-api.md 4.3 — `name`은 화면에 그대로 노출하고 그 문자열 그대로 `job_category`로
 * 전송·저장하는 값이다. 표시·저장 분리(코드·라벨)가 필요해지면 `items[]`에 필드를 추가한다 —
 * 객체 배열로 둔 이유다. 배열 순서가 곧 노출 순서다.
 */
export class JobCategoryListResponseDto {
  readonly items: { name: string }[];

  static from(names: readonly string[]): JobCategoryListResponseDto {
    return { items: names.map((name) => ({ name })) };
  }
}
