import { HttpStatus } from '@nestjs/common';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { UploadedFileInput } from './admin.types';

/**
 * 업로드 파일의 형식(확장자)·크기 판정 — 어긋나면 400 `VALIDATION_FAILED`(`details.field`). 통과하면 소문자 확장자를 돌려준다.
 *
 * 콘텐츠 업로드·재발행(`AdminContentService`)과 시리즈 표지(`AdminSeriesService`, KAN-234)가 **같은 함수**를 쓴다 —
 * 표지 검증이 콘텐츠 `thumbnail`과 같아야 한다는 요청(같은 형식 표·같은 상한·같은 문구)을 코드가 보장하게 한다.
 */
export function resolveUploadExtension(
  file: UploadedFileInput,
  allowed: Readonly<Record<string, string>>,
  maxBytes: number,
  field: string,
): string {
  const extension = file.originalName.split('.').pop()?.toLowerCase() ?? '';

  if (!(extension in allowed)) {
    throw uploadValidationFailed(
      field,
      `허용되지 않는 파일 형식이에요 (${Object.keys(allowed).join(', ')})`,
    );
  }
  if (file.size > maxBytes) {
    throw uploadValidationFailed(
      field,
      `파일이 너무 커요 (최대 ${Math.floor(maxBytes / 1024 / 1024)}MB)`,
    );
  }

  return extension;
}

/** admin.md 5장 — 검증 실패는 필드별 인라인 에러로 보여야 하므로 `field`를 싣는다 */
export function uploadValidationFailed(
  field: string,
  message: string,
): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.VALIDATION_FAILED,
    message,
    details: { field },
  });
}
