#!/usr/bin/env python3
"""대본 문체 검사 — writing-rules.md의 규칙과 corpus 프로파일을 기계로 대조한다.

이 스크립트가 있는 이유는 조언을 적어두는 것만으로는 문체가 재현되지 않기 때문이다.
`reference/writing-rules.md`에 "자연스럽게 쓰라"고 적어도 생성 결과는 논문 번역투로
수렴한다. 실측해서 어긋난 지점을 숫자로 되돌려주는 쪽이 작동한다.

    measure  실제 한국어 대본(corpus)에서 목표 프로파일을 뽑는다
    check    생성한 대본을 규칙 + 프로파일과 대조한다

판정은 세 단계다.
    실패  writing-rules.md가 명시적으로 금지·요구한 것을 어겼다. 고쳐야 한다
    경고  corpus 프로파일에서 벗어났다. 문체가 어색할 확률이 높다
    참고  판정하지 않는다. 사람이 볼 숫자다
"""

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

# ── 대본 파싱 ────────────────────────────────────────────────────────────
# 두 가지 형식을 모두 읽는다.
#   A: `이음: 대사`            — script-{n}.md 형식(writing-rules.md)
#   B: `**한기용**` + 다음 줄  — 유튜브 전사본 정리 형식(corpus)
SPEAKER_INLINE = re.compile(r"^([^\s:：]{1,10})\s*[:：]\s*(.+)$")
SPEAKER_BLOCK = re.compile(r"^\*\*([^*]{1,10})\*\*$")

# 메타 표·구분선·목록은 낭독되지 않는다
SKIP_LINE = re.compile(r"^(\||---|===|>|[-*+]\s|\d+\.\s|\s*$)")
# 대본 뒤에 붙는 부록(정리 내역·출처 메모 등)은 대본이 아니다.
# 첫 발화가 나온 뒤의 제목은 본문 종료로 본다 — 안 그러면 부록이 마지막 발화에 붙는다.
HEADING = re.compile(r"^#{1,6}\s")


def parse_turns(text):
    """[(화자, 발화)] 를 돌려준다. 형식은 자동으로 가린다."""
    lines = text.split("\n")
    block_hits = sum(1 for line in lines if SPEAKER_BLOCK.match(line.strip()))
    inline_hits = sum(1 for line in lines if SPEAKER_INLINE.match(line.strip()))

    turns = []
    if block_hits >= inline_hits:
        current = None
        for line in lines:
            s = line.strip()
            if turns and HEADING.match(s):
                break
            m = SPEAKER_BLOCK.match(s)
            if m:
                current = m.group(1)
                turns.append([current, ""])
            elif turns and current and not SKIP_LINE.match(s):
                turns[-1][1] += (" " if turns[-1][1] else "") + s
    else:
        for line in lines:
            s = line.strip()
            if turns and HEADING.match(s):
                break
            m = SPEAKER_INLINE.match(s)
            if m:
                turns.append([m.group(1), m.group(2)])

    # 굵게 표시(**)는 낭독되지 않는다 — 세기 전에 뗀다
    return [(spk, strip_markup(body)) for spk, body in turns if body.strip()]


def strip_markup(s):
    s = re.sub(r"\*+", "", s)
    return re.sub(r"\s+", " ", s).strip()


# ── 측정 항목 ────────────────────────────────────────────────────────────
def kb(word):
    """한글 낱말 경계. '좀'이 '조금'·'좁은'에 걸리지 않게 한다."""
    return re.compile(r"(?<![가-힣])" + re.escape(word) + r"(?![가-힣])")


# 실제 한국어 구어의 리듬을 만드는 완충어. 생성 대본에서 가장 먼저 사라진다.
FILLERS = ["좀", "뭐", "약간", "그니까", "그러니까", "되게", "이제", "막", "그냥", "사실"]

# 번역투 표지 — 영어 원문을 보면서 쓰면 통사가 그대로 남는다
TRANSLATIONESE = [
    "라는 것입니다", "라는 점입니다", "라는 것이다", "하는 것입니다",
    "흥미롭게도", "놀랍게도", "중요한 것은", "에 다름 아니",
    "할 수 있습니다만", "되어지", "지고 있습니다",
]

# writing-rules.md "시점 표현" — 오디오는 발행 후에도 계속 재생된다
TIME_WORDS = ["올해", "최근", "며칠 전", "요즘", "작년", "내년", "이번 주"]
# '지금'은 시점 표현("지금 시장은")과 담화 지시("지금 제가 말씀드린")로 갈린다.
# 기계로 못 가르므로 실패시키지 않고 세어서 사람에게 넘긴다 — 실측 corpus 14건이 전부 후자였다.
AMBIGUOUS_TIME = ["지금"]

SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


def sentences(body_text):
    out = []
    for chunk in SENT_SPLIT.split(body_text):
        c = chunk.strip()
        if c:
            out.append(c)
    return out


def measure(turns):
    bodies = [b for _, b in turns]
    text = " ".join(bodies)
    n_char = sum(len(b) for b in bodies)
    lengths = [len(b) for b in bodies]
    sents = sentences(text)

    # 종결어미 — 합니다체는 발표·뉴스의 어미다. 대화 비중이 높으면 낭독이 딱딱해진다
    formal = sum(1 for s in sents if re.search(r"(니다|니까)[.!?]?$", s))
    polite = sum(1 for s in sents if re.search(r"(요|죠)[.!?]?$", s))

    per10k = lambda c: (c / n_char * 10000) if n_char else 0.0

    speakers = {}
    for spk, b in turns:
        speakers[spk] = speakers.get(spk, 0) + len(b)

    # 같은 화자가 연달아 말한 최대 횟수 (writing-rules: 연달아 여섯 줄 이상 금지)
    run = best_run = 1
    for i in range(1, len(turns)):
        run = run + 1 if turns[i][0] == turns[i - 1][0] else 1
        best_run = max(best_run, run)

    return {
        "본문_글자수": n_char,
        "턴_수": len(turns),
        "턴_평균": round(statistics.mean(lengths), 1) if lengths else 0,
        "턴_중앙값": round(statistics.median(lengths), 1) if lengths else 0,
        "턴_최장": max(lengths) if lengths else 0,
        "짧은턴_비율": round(sum(1 for x in lengths if x <= 10) / len(lengths) * 100, 1) if lengths else 0,
        "긴턴_비율": round(sum(1 for x in lengths if x >= 100) / len(lengths) * 100, 1) if lengths else 0,
        "합니다체_비율": round(formal / (formal + polite) * 100, 1) if (formal + polite) else 0.0,
        "문장_수": len(sents),
        "문장_평균": round(statistics.mean([len(s) for s in sents]), 1) if sents else 0,
        "문장_100자초과": sum(1 for s in sents if len(s) > 100),
        "완충어": {w: round(per10k(len(kb(w).findall(text))), 1) for w in FILLERS},
        "완충어_합계": round(per10k(sum(len(kb(w).findall(text)) for w in FILLERS)), 1),
        "번역투": {w: text.count(w) for w in TRANSLATIONESE if text.count(w)},
        "시점표현": {w: len(kb(w).findall(text)) for w in TIME_WORDS if kb(w).findall(text)},
        "시점표현_모호": {w: len(kb(w).findall(text)) for w in AMBIGUOUS_TIME if kb(w).findall(text)},
        "url": len(re.findall(r"https?://", text)),
        "괄호주석": len(re.findall(r"\([^)]{2,}\)", text)),
        "화자별_글자수": speakers,
        "같은화자_최대연속": best_run,
    }


# ── 판정 ─────────────────────────────────────────────────────────────────
# writing-rules.md가 명시한 값. 여기 있는 건 문서가 원본이고 이 파일은 복사본이다.
HARD = {
    "본문_하한": 3500,
    "본문_상한": 5250,
    "낭독_속도": 350,
    "연속_상한": 6,
}


def check(m, profile):
    """[(등급, 항목, 메시지)] 를 돌려준다."""
    r = []
    F, W, I = "실패", "경고", "참고"

    # ── writing-rules.md 명시 규칙 ──
    n = m["본문_글자수"]
    if n < HARD["본문_하한"]:
        r.append((F, "분량", f"{n}자 — 하한 {HARD['본문_하한']}자 미달. 늘려 쓰지 말고 반려 검토"))
    elif n > HARD["본문_상한"]:
        r.append((F, "분량", f"{n}자 — 상한 {HARD['본문_상한']}자 초과"))
    else:
        r.append((I, "분량", f"{n}자 · 약 {n / HARD['낭독_속도']:.1f}분 (350자/분)"))

    if m["문장_100자초과"]:
        r.append((F, "긴 문장", f"100자 초과 {m['문장_100자초과']}건 — 눈으로 되짚을 수 없는 매체다"))

    if m["시점표현"]:
        r.append((F, "시점 표현", f"{m['시점표현']} — 발행 후에도 재생된다. 절대 시점으로 바꾼다"))
    if m["시점표현_모호"]:
        r.append((I, "시점 표현?", f"{m['시점표현_모호']} — 시점 지시면 고치고 담화 지시면 둔다. 사람이 본다"))

    if m["url"]:
        r.append((F, "낭독 규격", f"URL {m['url']}건 — 낭독되지 않는다"))
    if m["괄호주석"]:
        r.append((W, "낭독 규격", f"괄호 {m['괄호주석']}건 — 낭독되면 문장이 끊긴다"))

    if m["같은화자_최대연속"] >= HARD["연속_상한"]:
        r.append((F, "화자 교대", f"한 화자 연속 {m['같은화자_최대연속']}턴 — 강의가 되면 2인으로 쓴 이유가 없다"))

    if m["번역투"]:
        r.append((F, "번역투", f"{m['번역투']} — 원문 통사가 남았다"))

    # ── corpus 프로파일 대조 ──
    if not profile:
        r.append((I, "프로파일", "corpus 프로파일이 없어 문체 대조를 건너뛴다"))
        return r

    p = profile["목표"]

    if m["합니다체_비율"] > p["합니다체_비율_상한"]:
        r.append((W, "합니다체", f"{m['합니다체_비율']}% — 상한 {p['합니다체_비율_상한']}% "
                                 f"(corpus {profile['출처']['합니다체_비율']}%). 발표문에 가깝다"))
    else:
        r.append((I, "합니다체", f"{m['합니다체_비율']}%"))

    if m["완충어_합계"] < p["완충어_합계_하한"]:
        빈 = [w for w, v in m["완충어"].items() if v == 0]
        r.append((W, "완충어", f"만자당 {m['완충어_합계']} — 하한 {p['완충어_합계_하한']} "
                               f"(corpus {profile['출처']['완충어_합계']}). 안 쓴 말: {', '.join(빈) or '없음'}"))
    else:
        r.append((I, "완충어", f"만자당 {m['완충어_합계']}"))

    # 짧은 턴은 판정하지 않는다 — writing-rules.md와 충돌 중이다(changes/pending 참조)
    r.append((I, "턴 분포", f"중앙값 {m['턴_중앙값']}자 · 짧은턴 {m['짧은턴_비율']}% · 최장 {m['턴_최장']}자 "
                            f"| corpus 중앙값 {profile['출처']['턴_중앙값']}자 · 짧은턴 {profile['출처']['짧은턴_비율']}%"))

    tot = sum(m["화자별_글자수"].values())
    if tot:
        share = {k: round(v / tot * 100) for k, v in m["화자별_글자수"].items()}
        r.append((I, "화자 비중", " · ".join(f"{k} {v}%" for k, v in share.items())))
    return r


# ── CLI ──────────────────────────────────────────────────────────────────
def cmd_measure(args):
    paths = [Path(p) for p in args.files]
    all_turns, per_file = [], []
    for p in paths:
        t = parse_turns(p.read_text(encoding="utf-8"))
        if not t:
            print(f"  ! {p.name}: 화자를 찾지 못했다 — 건너뜀", file=sys.stderr)
            continue
        all_turns += t
        per_file.append((p.name, measure(t)))

    if not all_turns:
        print("측정할 대본이 없다.", file=sys.stderr)
        return 1

    agg = measure(all_turns)
    print(f"corpus {len(per_file)}편 · 턴 {agg['턴_수']} · {agg['본문_글자수']}자\n")
    for name, m in per_file:
        print(f"  {name}")
        print(f"    턴 {m['턴_수']} · 중앙값 {m['턴_중앙값']}자 · 짧은턴 {m['짧은턴_비율']}% "
              f"· 합니다체 {m['합니다체_비율']}% · 완충어 {m['완충어_합계']}")

    profile = {
        "설명": "corpus에서 뽑은 실측값. 목표값은 여기서 여유를 둔 것이다.",
        "corpus_편수": len(per_file),
        "잠정": len(per_file) < 3,
        "출처": {k: agg[k] for k in
                 ["합니다체_비율", "완충어_합계", "턴_중앙값", "짧은턴_비율", "긴턴_비율", "턴_최장", "문장_평균"]},
        "출처_완충어": agg["완충어"],
        "목표": {
            # corpus의 2배까지는 허용한다. 정확히 맞추라는 게 아니라 발표문으로 가는 걸 막는 선이다
            "합니다체_비율_상한": round(min(agg["합니다체_비율"] * 2 + 5, 40), 1),
            # corpus의 절반은 나와야 한다
            "완충어_합계_하한": round(agg["완충어_합계"] * 0.5, 1),
        },
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n프로파일 → {out}")
    if profile["잠정"]:
        print(f"  ! corpus {len(per_file)}편. 3편 미만이면 개인 말버릇과 장르 특성이 안 갈린다 — 잠정값이다")
    return 0


def cmd_check(args):
    p = Path(args.file)
    turns = parse_turns(p.read_text(encoding="utf-8"))
    if not turns:
        print("화자를 찾지 못했다. `이음: 대사` 또는 `**이름**` 형식인지 확인한다.", file=sys.stderr)
        return 2

    profile = None
    pp = Path(args.profile)
    if pp.exists():
        profile = json.loads(pp.read_text(encoding="utf-8"))

    m = measure(turns)
    results = check(m, profile)

    print(f"{p.name}\n")
    mark = {"실패": "✗", "경고": "△", "참고": "·"}
    for grade in ("실패", "경고", "참고"):
        for g, item, msg in results:
            if g == grade:
                print(f"  {mark[g]} {item:<10} {msg}")

    fails = sum(1 for g, _, _ in results if g == "실패")
    warns = sum(1 for g, _, _ in results if g == "경고")
    print(f"\n  실패 {fails} · 경고 {warns}")
    if profile and profile.get("잠정"):
        print(f"  ! 프로파일은 corpus {profile['corpus_편수']}편 기준의 잠정값이다")
    if args.json:
        print("\n" + json.dumps(m, ensure_ascii=False, indent=2))
    return 1 if fails else 0


def main():
    here = Path(__file__).resolve().parent
    default_profile = here.parent / "reference" / "style-profile.json"

    ap = argparse.ArgumentParser(description="대본 문체 검사")
    sub = ap.add_subparsers(dest="cmd", required=True)

    mp = sub.add_parser("measure", help="corpus에서 목표 프로파일을 뽑는다")
    mp.add_argument("files", nargs="+")
    mp.add_argument("-o", "--out", default=str(default_profile))
    mp.set_defaults(func=cmd_measure)

    cp = sub.add_parser("check", help="대본을 규칙·프로파일과 대조한다")
    cp.add_argument("file")
    cp.add_argument("--profile", default=str(default_profile))
    cp.add_argument("--json", action="store_true", help="측정값 전체를 JSON으로 덧붙인다")
    cp.set_defaults(func=cmd_check)

    args = ap.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
