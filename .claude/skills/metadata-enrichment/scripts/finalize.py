#!/usr/bin/env python3
"""enrichment.json 정규화·검증 — docs/ai/metadata-pipeline.md 4.2·4.4의 구현.

초안을 읽어 keywords를 NFC 정규화 + 공백 정리한 뒤, enum·형식을
docs/backend/domain.md 5.1 기준으로 검증한다. 통과하면 확정본을 쓰고,
실패하면 산출물 없이 종료한다(명세 7장 — enum에 없는 값은 산출물을 내지 않는다).

사용법:
    python3 finalize.py <초안.json> -o <확정본.json> [--topics "주제1,주제2"]
"""

import argparse
import json
import sys
import unicodedata

# 값 집합의 원본은 docs/backend/domain.md 5.1 — 어긋나면 domain.md가 기준이다
DIFFICULTY_ENUM = {"beginner", "intermediate", "advanced"}
FORMAT_ENUM = {"news_analysis", "howto", "interview", "opinion", "case_study", "overview"}
ALLOWED_KEYS = {"schema_version", "difficulty", "format", "is_evergreen", "keywords", "target_audiences", "embedding", "source"}
SCHEMA_VERSION = 2  # 산출물 형식 버전 — metadata-pipeline.md 4.4. 서버 CURRENT_ENRICHMENT_SCHEMA_VERSION과 같아야 한다
# 값 집합의 원본은 backend/src/modules/user/user.constant.ts JOB_CATEGORIES · user.enum.ts YearsOfExperienceRange
JOB_CATEGORIES = {"개발", "기획", "디자인", "마케팅·영업", "운영·CS", "연구·교육", "기타"}
YEARS_RANGES = {"0-1", "2-3", "4-6", "7+"}
TARGET_AUDIENCES_MAX = 8
KEYWORDS_MAX = 8
KEYWORDS_RECOMMENDED_MIN = 3  # 미만은 경고만 — 억지로 채우지 않는다(명세 7장)


def normalize_keyword(raw: str) -> str:
    """NFC 정규화 + 공백 정리 — 가중치 집계가 문자열 일치로 묶인다(명세 4.2)."""
    return " ".join(unicodedata.normalize("NFC", raw).split())


def main() -> int:
    parser = argparse.ArgumentParser(description="enrichment.json 정규화·검증")
    parser.add_argument("draft", help="초안 json 경로")
    parser.add_argument("-o", "--output", required=True, help="확정본 출력 경로")
    parser.add_argument("--topics", default="", help="부여된 주제명 콤마 구분 — 키워드가 주제 반복인지 대조")
    args = parser.parse_args()

    try:
        with open(args.draft, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"실패: 초안을 읽을 수 없다 — {e}", file=sys.stderr)
        return 1

    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(data, dict):
        print("실패: 최상위가 객체가 아니다", file=sys.stderr)
        return 1

    unknown = set(data) - ALLOWED_KEYS
    if unknown:
        errors.append(f"허용되지 않는 키: {sorted(unknown)} — 허용 키는 {sorted(ALLOWED_KEYS)}")

    if "difficulty" in data and data["difficulty"] not in DIFFICULTY_ENUM:
        errors.append(f"difficulty enum 불일치: {data['difficulty']!r} — 허용값 {sorted(DIFFICULTY_ENUM)}")

    if "format" in data and data["format"] not in FORMAT_ENUM:
        errors.append(f"format enum 불일치: {data['format']!r} — 허용값 {sorted(FORMAT_ENUM)}")

    if "is_evergreen" in data and not isinstance(data["is_evergreen"], bool):
        errors.append(f"is_evergreen이 boolean이 아니다: {data['is_evergreen']!r}")

    if "source" in data and data["source"] != "title_description":
        errors.append(f"source에는 'title_description'만 올 수 있다(명세 4.5): {data['source']!r}")

    if "keywords" in data:
        kws = data["keywords"]
        if not isinstance(kws, list) or not all(isinstance(k, str) and k.strip() for k in kws):
            errors.append("keywords는 비어 있지 않은 문자열 배열이어야 한다")
        else:
            normalized: list[str] = []
            for kw in kws:
                norm = normalize_keyword(kw)
                if norm in normalized:
                    warnings.append(f"정규화 후 중복 키워드 제거: {norm!r}")
                    continue
                normalized.append(norm)

            topics = {normalize_keyword(t) for t in args.topics.split(",") if t.strip()}
            for kw in normalized:
                if kw in topics:
                    errors.append(f"키워드가 주제명의 단순 반복이다: {kw!r} — 주제보다 잘게 잡는다(명세 4.2)")

            if len(normalized) == 0:
                errors.append("keywords가 빈 배열이다 — 0개면 키를 생략한다(명세 7장)")
            elif len(normalized) > KEYWORDS_MAX:
                errors.append(f"keywords {len(normalized)}개 — 최대 {KEYWORDS_MAX}개")
            elif len(normalized) < KEYWORDS_RECOMMENDED_MIN:
                warnings.append(f"keywords {len(normalized)}개 — 3개 미만은 대본이 얇다는 신호다. 억지로 채우지 말고 그대로 보고한다")

            data["keywords"] = normalized

    if "schema_version" in data and data["schema_version"] != SCHEMA_VERSION:
        errors.append(f"schema_version은 {SCHEMA_VERSION}이어야 한다: {data['schema_version']!r}")
    data["schema_version"] = SCHEMA_VERSION  # 새 실행은 항상 현재 형식 버전을 적는다(명세 4.4)

    if "target_audiences" in data:
        tas = data["target_audiences"]
        if not isinstance(tas, list) or not tas:
            errors.append("target_audiences는 비어 있지 않은 배열이어야 한다 — 범용 대본이면 키를 생략한다")
        elif len(tas) > TARGET_AUDIENCES_MAX:
            errors.append(f"target_audiences {len(tas)}세트 — 최대 {TARGET_AUDIENCES_MAX}. 그 이상이면 범용이므로 키를 생략한다")
        else:
            seen: set[tuple[str, str]] = set()
            deduped = []
            for ta in tas:
                if not isinstance(ta, dict) or set(ta) != {"job_category", "years_of_experience"}:
                    errors.append(f"target_audiences 항목은 {{job_category, years_of_experience}}만 가진 객체여야 한다: {ta!r}")
                    continue
                job, years = ta["job_category"], ta["years_of_experience"]
                if job not in JOB_CATEGORIES:
                    errors.append(f"job_category가 직군 목록에 없다: {job!r} — 허용값 {sorted(JOB_CATEGORIES)}")
                if years not in YEARS_RANGES:
                    errors.append(f"years_of_experience가 구간 밖이다: {years!r} — 허용값 {sorted(YEARS_RANGES)}")
                if (job, years) in seen:
                    warnings.append(f"중복 청자 세트 제거: {job} {years}")
                    continue
                seen.add((job, years))
                deduped.append({"job_category": job, "years_of_experience": years})
            data["target_audiences"] = deduped

    if "embedding" in data:
        emb = data["embedding"]
        if not isinstance(emb, dict):
            errors.append("embedding은 { model, vector } 객체여야 한다")
        else:
            if not (isinstance(emb.get("model"), str) and emb["model"].strip()):
                errors.append("embedding.model이 비어 있다 — 모델 식별자 없는 벡터는 만들지 않는다(명세 4.3)")
            vec = emb.get("vector")
            if not (isinstance(vec, list) and vec and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vec)):
                errors.append("embedding.vector는 비어 있지 않은 숫자 배열이어야 한다")

    if not any(k in data for k in ("difficulty", "format", "is_evergreen", "keywords", "target_audiences")):
        errors.append("메타 5종이 전부 생략됐다 — 산출할 내용이 없다. 판정을 다시 하거나 실행을 중단한다")

    for w in warnings:
        print(f"경고: {w}")

    if errors:
        for e in errors:
            print(f"실패: {e}", file=sys.stderr)
        print("확정본을 만들지 않았다 — 값을 고쳐 재판정 후 다시 실행한다.", file=sys.stderr)
        return 1

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    omitted = sorted({"difficulty", "format", "is_evergreen", "keywords", "target_audiences"} - set(data))
    print(f"확정: {args.output}")
    if omitted:
        print(f"생략된 키(partial): {omitted}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
