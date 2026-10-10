import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * `subscription-api.md` 4.8 — 초대 코드 입력. 모양 검사는 느슨하게 둔다(대소문자·앞뒤 공백은 서버가 정규화한다).
 * 저장 규칙 밖의 값은 "없는 코드"(404)로 같이 처리된다 — 400으로 갈라 주면 코드 규칙을 알려 주는 셈이다.
 */
export class RedeemInviteCodeRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  readonly code: string;
}
