import { IsISO8601 } from 'class-validator';

/**
 * 회수 동기화 조회(`partner-control.md` 4.3 — `GET /contents/withdrawn?since=`).
 * `since`는 클라이언트가 마지막으로 동기화한 시각(ISO 8601)이다.
 */
export class GetWithdrawnContentsQueryRequestDto {
  @IsISO8601()
  readonly since: string;
}
