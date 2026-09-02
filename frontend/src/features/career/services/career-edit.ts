/**
 * 커리어 편집 판정의 순수 로직 — 규칙 소유: career.md 4.1(변경 있음·초기화 활성) ·
 * career-uiux.md 4.1(필드 단위 값 비교) · career-api.md 2장(비움은 null, 공백 정규화).
 */
import type { CareerInfo } from '../career.types';

/** 편집 중인 폼 값 — jobTitle은 입력 원문(트림 전)이다. 비교·전송 전에 정규화를 거친다 */
export interface CareerFormValues {
  jobCategory: CareerInfo['jobCategory'];
  jobTitle: string;
  yearsOfExperience: CareerInfo['yearsOfExperience'];
}

/**
 * 공백만인 직무는 빈 값이다 — 비움은 ''이 아니라 null로 보낸다(career-api.md 2장 —
 * 서버도 같은 정규화를 하지만, 클라이언트가 먼저 하면 "공백 하나"가 변경 있음으로 읽히지 않는다).
 */
export const normalizeJobTitle = (raw: string): string | null => {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
};

/** 폼 → 저장 본문. 전체 교체 계약이라 세 키를 전부 싣는다 — 비움도 키 생략이 아니라 null이다(career-api.md 4.2) */
export const toCareerInfoFromForm = (form: CareerFormValues): CareerInfo => ({
  jobCategory: form.jobCategory,
  jobTitle: normalizeJobTitle(form.jobTitle),
  yearsOfExperience: form.yearsOfExperience,
});

/**
 * [초기화] 활성 판정의 기준은 편집 중인 폼이다(career-uiux.md 4.2) — 서버 값이 있어도
 * 손으로 다 비웠다면 더 비울 것이 없다.
 */
export const isCareerFormEmpty = (form: CareerFormValues): boolean => {
  const normalized = toCareerInfoFromForm(form);
  return (
    normalized.jobCategory === null &&
    normalized.jobTitle === null &&
    normalized.yearsOfExperience === null
  );
};

/**
 * 변경 있음 판정 — 탭 이력이 아니라 필드 단위 값 비교다(career-uiux.md 4.1).
 * 값을 바꿨다가 손으로 되돌리면 변경 없음이고, [저장]은 비활성·이탈 팝업도 뜨지 않는다.
 */
export const hasCareerFormChanges = (baseline: CareerInfo, form: CareerFormValues): boolean => {
  const edited = toCareerInfoFromForm(form);
  return (
    edited.jobCategory !== baseline.jobCategory ||
    edited.jobTitle !== baseline.jobTitle ||
    edited.yearsOfExperience !== baseline.yearsOfExperience
  );
};

/** 미입력 사용자 판정 — 유도 문구("입력하면 추천이 정확해져요") 분기의 기준은 서버 값이다(career.md 5장) */
export const isCareerEmpty = (career: CareerInfo): boolean =>
  career.jobCategory === null && career.jobTitle === null && career.yearsOfExperience === null;
