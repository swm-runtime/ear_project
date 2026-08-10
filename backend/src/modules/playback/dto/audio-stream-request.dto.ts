import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Min, MaxLength } from 'class-validator';

/**
 * 서명 URL의 쿼리(`AudioUrlSigner`가 만든 형태).
 *
 * **이 값들은 신뢰 경계 밖이다** — 클라이언트가 만들어 보낼 수 있으므로 형식만 여기서 보고,
 * 진짜 판정은 서명 검증이 한다. `user`를 그대로 신뢰해 스코프를 잡지 않는다는 뜻이다:
 * 서명이 `contentId:userId:expires`를 함께 덮으므로 셋 중 하나만 바꿔도 검증이 깨진다.
 */
export class AudioStreamRequestDto {
  @IsUUID()
  readonly user: string;

  /** 만료 시각(epoch 초). 서명 대상에 포함되므로 늘려도 검증이 깨진다 */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  readonly expires: number;

  @IsString()
  @MaxLength(64)
  readonly signature: string;
}
