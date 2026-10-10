import type { ImageSourcePropType } from 'react-native';

/**
 * 직군 칩의 배경 사진(PM 2026-10-10 17:47 "직업 알약 배경에 이미지", 18:07 "다른 거 찾아서 넣어"). 직군 전용 사진이다 —
 * CC0·퍼블릭 도메인만 골랐고 출처는 assets/careers/SOURCES.md. 칩 비율(3:1)로 주인공이 가운데 오게 미리 잘라 두어
 * 칩에서 다시 잘리지 않는다(18:09 "알약에 들어갈 때 사진이 잘린다" — 칩도 2열 같은 크기로 고정했다).
 * 직군 이름은 서버 상수(backend user.constant.ts JOB_CATEGORIES)와 같다. 목록에 없는 직군은 기본 사진으로 떨어진다
 */
const JOB_CATEGORY_IMAGE: Record<string, ImageSourcePropType> = {
  개발: require('../../../assets/careers/job-dev.jpg'),
  기획: require('../../../assets/careers/job-planning.jpg'),
  디자인: require('../../../assets/careers/job-design.jpg'),
  '마케팅·영업': require('../../../assets/careers/job-marketing-sales.jpg'),
  '운영·CS': require('../../../assets/careers/job-operations-cs.jpg'),
  '연구·교육': require('../../../assets/careers/job-research-education.jpg'),
  기타: require('../../../assets/careers/job-other.jpg'),
};
const FALLBACK_IMAGE: ImageSourcePropType = require('../../../assets/topics/default.jpg');

export const jobCategoryImageSource = (name: string): ImageSourcePropType =>
  JOB_CATEGORY_IMAGE[name] ?? FALLBACK_IMAGE;
