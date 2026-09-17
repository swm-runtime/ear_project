import { ValidateBy, ValidationOptions } from 'class-validator';

import { isTimestampValue } from '@/common/utils/cursor-value.util';

/**
 * `published_at` — **날짜·시각·오프셋(Z 또는 ±hh:mm)이 모두 있는 ISO 8601만** 받는다.
 *
 * `IsISO8601`은 `2026-W38-4`(주 표기)·`20260101`처럼 JS `Date`가 못 읽는 형식을 통과시켜 저장 단계에서
 * 500이 되고, 오프셋 없는 `2026-01-01T09:00`은 **서버 시간대로 해석돼** 예약 발행이 호스트에 따라
 * 9시간 어긋난다. 범위는 2000~2100년으로 막는다 — 목록 커서가 그 밖의 시각을 거절하므로(`cursor-value.util.ts`)
 * 1999년 같은 오타가 저장되면 앱이 다음 페이지를 영영 받지 못한다.
 */
const ISO_DATETIME_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

export function IsNoticeTimestamp(
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isNoticeTimestamp',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          ISO_DATETIME_WITH_OFFSET.test(value) &&
          isTimestampValue(value),
        defaultMessage: () =>
          '$property must be an ISO 8601 date-time with offset between 2000 and 2100',
      },
    },
    options,
  );
}

/**
 * 글자 수 상한을 **코드 포인트**로 센다 — Postgres `varchar(n)`이 세는 단위다. `MaxLength`는 `❤️` 같은
 * 조합 이모지를 1자로 세어 통과시키고, DB는 2자로 세어 `value too long` 500이 된다.
 */
export function MaxCodePoints(
  max: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxCodePoints',
      constraints: [max],
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && [...value].length <= max,
        defaultMessage: () => `$property must be at most ${max} characters`,
      },
    },
    options,
  );
}
