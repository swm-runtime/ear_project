import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { ConsentType } from '../user.enum';

/** 동의는 종류별로 각각 별개 행으로 기록한다 (domain.md 3.2) */
export class ConsentInputDto {
  @IsEnum(ConsentType)
  readonly consent_type: ConsentType;

  /** marketing은 버전이 없다 */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  readonly version?: string | null;

  @IsBoolean()
  readonly is_agreed: boolean;
}
