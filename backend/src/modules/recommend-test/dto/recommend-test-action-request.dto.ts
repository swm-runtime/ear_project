import { IsEnum, IsUUID } from 'class-validator';

import { RecommendTestAction } from '../recommend-test.enum';

/** `POST /admin/recommend-test/actions` */
export class RecommendTestActionRequestDto {
  @IsEnum(RecommendTestAction)
  readonly action: RecommendTestAction;

  @IsUUID('4')
  readonly content_id: string;
}
