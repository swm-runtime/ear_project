import { IsInt, Max, Min } from 'class-validator';

/** 편 담기(`SaveContentRequestDto`)와 같은 상한 — 정수 범위를 벗어난 값을 받지 않는다(architecture.md 9.3) */
const MAX_CLIENT_SEQ = Number.MAX_SAFE_INTEGER;

/**
 * `POST /series/:series_id/save`(explore-api.md 4.8 — KAN-245).
 *
 * `client_seq`는 편 담기(4.3)와 같은 뜻이다 — 이 시리즈에 대한 담기·빼기 조작의 클라이언트 단조 증가 순번이고, **서버는
 * 저장·판정하지 않고 응답에 그대로 되돌린다.** 담기·빼기가 각각 멱등이라 서버 상태는 마지막 도착 요청으로 수렴한다.
 * `reason`은 받지 않는다 — 시리즈 담기에는 자동 적립 경로가 없다.
 */
export class SaveSeriesRequestDto {
  @IsInt()
  @Min(0)
  @Max(MAX_CLIENT_SEQ)
  readonly client_seq: number;
}
