import { IsString, MaxLength } from 'class-validator';

export class LogoutRequestDto {
  @IsString()
  @MaxLength(200)
  readonly device_id: string;
}
