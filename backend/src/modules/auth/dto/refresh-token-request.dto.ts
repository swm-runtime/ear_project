import { IsString, MaxLength } from 'class-validator';

export class RefreshTokenRequestDto {
  @IsString()
  @MaxLength(200)
  readonly refresh_token: string;

  @IsString()
  @MaxLength(200)
  readonly device_id: string;
}
