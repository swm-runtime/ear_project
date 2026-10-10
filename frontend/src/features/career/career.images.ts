import type { ImageSourcePropType } from 'react-native';

/**
 * 직군 칩의 배경 사진(PM 2026-10-10 17:47 "직업 알약 배경에 이미지 넣고 테두리 없애자"). 직군 전용 사진이 아직 없어
 * 관심 주제 사진 중 가장 가까운 것을 물려 쓴다 — 전용 사진이 생기면 여기만 바꾼다. 직군 이름은 서버 상수
 * (backend user.constant.ts JOB_CATEGORIES)와 같다. 목록에 없는 직군은 기본 사진으로 떨어진다
 */
const JOB_CATEGORY_IMAGE: Record<string, ImageSourcePropType> = {
  개발: require('../../../assets/topics/topic-it-dev.jpg'),
  기획: require('../../../assets/topics/topic-productivity.jpg'),
  디자인: require('../../../assets/topics/topic-design.jpg'),
  '마케팅·영업': require('../../../assets/topics/topic-marketing.jpg'),
  '운영·CS': require('../../../assets/topics/topic-communication.jpg'),
  '연구·교육': require('../../../assets/topics/topic-science.jpg'),
  기타: require('../../../assets/topics/topic-career.jpg'),
};
const FALLBACK_IMAGE: ImageSourcePropType = require('../../../assets/topics/default.jpg');

export const jobCategoryImageSource = (name: string): ImageSourcePropType =>
  JOB_CATEGORY_IMAGE[name] ?? FALLBACK_IMAGE;
