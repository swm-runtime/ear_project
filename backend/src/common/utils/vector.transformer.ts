import { ValueTransformer } from 'typeorm';

/**
 * pgvector 컬럼 ↔ `number[]` 변환.
 *
 * TypeORM은 `vector` 타입을 모른다 — Entity의 `type: 'text'`는 DDL에 쓰이지 않고
 * (스키마는 수동 마이그레이션이 소유한다 — convention.md 4.5) 런타임 직렬화만 담당한다.
 * pgvector의 텍스트 표현(`[0.1,0.2,...]`)은 유효한 JSON 배열이라 그대로 파싱하고,
 * 쓰기는 같은 표현의 문자열로 보내면 Postgres가 `unknown → vector`로 캐스팅한다.
 */
export const vectorTransformer: ValueTransformer = {
  to: (value: number[] | null | undefined): string | null | undefined =>
    value == null ? value : `[${value.join(',')}]`,
  from: (raw: string | null): number[] | null =>
    raw == null ? null : (JSON.parse(raw) as number[]),
};
