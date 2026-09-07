import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { ContentSourceInputDto } from './upload-content-request.dto';

/**
 * admin-api.md 4.10 — 재발행 `payload`(JSON 문자열)를 파싱한 결과.
 * 4.6 `payload`의 **부분집합**이며 전부 선택이다 — 넘어온 키만 바꾼다.
 *
 * `origin` · `partner_id` · `series_*` · `license_expires_at`은 **의도적으로 없다.**
 * 발행 단위의 정체성이라 바꾸려면 회수하고 새로 올린다. `forbidNonWhitelisted` 검증에
 * 걸리므로 이 키들을 보내면 400이다.
 */
export class RepublishContentRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  readonly description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly source_name?: string;

  /** 넘기면 전체 교체다. 빈 배열은 주제 없는 콘텐츠를 만들므로 막는다(4.6과 동일) */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  readonly topic_ids?: string[];

  /**
   * 넘기면 전체 교체다. **비울 수 있는지는 `origin`이 정한다** — `ai_generated`는 1개 이상이
   * 필요하고(admin.md 3.1) `partner`는 넣지 않는다. `origin`을 알아야 하므로 Service가 본다
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ContentSourceInputDto)
  readonly sources?: ContentSourceInputDto[];
}

/** multipart 본문의 텍스트 필드. 재발행은 payload도 선택이다(오디오만 보내는 경우가 기본) */
export class RepublishContentFormRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  readonly payload?: string;
}
