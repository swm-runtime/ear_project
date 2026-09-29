import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/** `PUT /admin/recommend-test/interests` — 관심 주제 관리 화면의 전체 교체와 같은 본문 */
export class RecommendTestInterestsRequestDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  readonly topic_ids: string[];
}
