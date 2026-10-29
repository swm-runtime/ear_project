"""이어 인스타 릴스 — 매일 한 편.

  python main.py build   [--date YYYY-MM-DD] [--episode ID] [--no-ai] [--no-images] [--local]
  python main.py publish --date YYYY-MM-DD

build : 발행된 편 하나를 골라 30~60초 구간을 자르고 영상을 만든다 → S3 업로드 → Slack 미리보기(승인 링크).
publish: 승인된 날의 영상을 인스타 릴스로 게시한다 → Slack 에 게시 주소.
--local 은 S3 업로드·상태 기록·Slack 없이 out/<날짜>/ 에 영상만 남긴다(로컬 확인용).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import sys

import requests

import ai
import config
import render
import source

HERE = os.path.dirname(os.path.abspath(__file__))


def kst_today() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=9)).date()


def slack(text: str) -> None:
    if not config.SLACK_WEBHOOK_URL:
        # 본문에 미리보기 서명 주소가 있을 수 있어 첫 줄만 남긴다(Actions 로그는 공개)
        print(f"[slack 생략] {text.splitlines()[0]}")
        return
    requests.post(config.SLACK_WEBHOOK_URL, json={"text": text}, timeout=30).raise_for_status()


def gh_output(**kv) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        for k, v in kv.items():
            f.write(f"{k}={v}\n")


# ---------- 구간 ----------

def candidate_lines(material: dict) -> list[dict]:
    """인트로(고정 인사)·마무리(클로징 인사)를 뺀 줄. 첫 재생 30초 이탈의 원인이 인트로라 릴스에 쓰지 않는다."""
    segs = material["segments"]
    sections = sorted(material["sections"], key=lambda s: s["start_sec"])
    body_start = next((s["start_sec"] for s in sections if s.get("kind") not in (None, "intro")), None)
    outro_start = next((s["start_sec"] for s in sections if s.get("kind") == "outro"), None)
    out = []
    for i, s in enumerate(segs):
        if body_start is not None and s["start_sec"] < body_start - 0.01:
            continue
        if outro_start is not None and s["start_sec"] >= outro_start - 0.01:
            continue
        out.append({"idx": i, **s})
    if not sections:  # 구간 정보가 없는 옛 편 — 앞 1줄·뒤 2줄을 버린다
        out = out[1:-2]
    return out


def fit_span(segs: list[dict], allowed: set[int], start: int, end: int) -> tuple[int, int]:
    """모델이 고른 구간을 길이 범위에 맞춘다 — 길면 뒤를 줄이고, 짧으면 뒤로(안 되면 앞으로) 늘린다."""
    start, end = max(start, min(allowed)), min(end, max(allowed))
    if end < start:
        end = start

    def dur(a, b):
        return segs[b]["end_sec"] - segs[a]["start_sec"]

    while dur(start, end) > config.CLIP_MAX_SEC and end > start:
        end -= 1
    while dur(start, end) < config.CLIP_MIN_SEC and end + 1 in allowed and dur(start, end + 1) <= config.CLIP_MAX_SEC:
        end += 1
    while dur(start, end) < config.CLIP_MIN_SEC and start - 1 in allowed and dur(start - 1, end) <= config.CLIP_MAX_SEC:
        start -= 1
    return start, end


def heuristic_pick(material: dict, cands: list[dict]) -> dict:
    """모델 없이 — 첫 본문 단락 처음부터 40초 남짓. 문구는 단락 제목으로."""
    body = [s for s in material["sections"] if s.get("kind") == "body"]
    first = body[0]["start_sec"] if body else cands[0]["start_sec"]
    start = next(c["idx"] for c in cands if c["start_sec"] >= first - 0.01)
    end = start
    segs = material["segments"]
    while end + 1 in {c["idx"] for c in cands} and segs[end]["end_sec"] - segs[start]["start_sec"] < 40:
        end += 1
    title = (body[0].get("summary") or body[0]["title"]) if body else material["title"]
    caption = f"{material['title']}\n\n전체 이야기는 '이어' 앱에서 들을 수 있어요.\n#이어 #팟캐스트 #AI팟캐스트"
    return {"start_idx": start, "end_idx": end, "title": title, "caption": caption, "image_prompts": [],
            "reason": "모델 없이 첫 본문 단락"}


# ---------- build ----------

def build(args) -> None:
    date = args.date or kst_today().isoformat()
    state = source.load_state() if not args.local else {"proposed": {}, "posted": {}}
    if args.episode:
        episode_id = args.episode
    else:
        ep = source.choose_episode(state, dt.date.fromisoformat(date))
        if not ep:
            slack(f":warning: 릴스 {date} — 올릴 편이 없다(발행된 편을 다 썼거나 재료가 없다)")
            sys.exit(0)
        episode_id = ep.id
    material = source.episode_material(episode_id)
    if not material["audio_key"]:
        raise RuntimeError(f"{episode_id} 오디오가 없다")
    segs = material["segments"]
    cands = candidate_lines(material)
    if not cands:
        raise RuntimeError(f"{episode_id} 고를 줄이 없다")

    use_ai = bool(config.OPENAI_API_KEY) and not args.no_ai
    if args.pick:
        # 사람이 고른 구간·문구 — {start_idx, end_idx, title, caption, reason, image_prompts?}
        with open(args.pick, encoding="utf-8") as f:
            pick = {"image_prompts": [], "reason": "사람이 고름", **json.load(f)}
    else:
        pick = ai.pick_clip(material, cands) if use_ai else heuristic_pick(material, cands)
    start, end = fit_span(segs, {c["idx"] for c in cands}, int(pick["start_idx"]), int(pick["end_idx"]))
    clip_start = max(0.0, segs[start]["start_sec"] - 0.1)
    speech_end = segs[end]["end_sec"] + 0.25
    speech_dur = speech_end - clip_start

    work = os.path.join(HERE, "out", date)
    if os.path.isdir(work):
        shutil.rmtree(work)
    os.makedirs(work)
    source.download(material["audio_key"], os.path.join(work, "audio" + os.path.splitext(material["audio_key"])[1]))
    audio = "audio" + os.path.splitext(material["audio_key"])[1]

    images: list[str] = []
    if use_ai and not args.no_images:
        for i, prompt in enumerate(pick["image_prompts"][: config.IMAGE_COUNT]):
            name = f"img{i}.png"
            try:
                ai.generate_image(prompt, os.path.join(work, name))
                images.append(name)
            except Exception as e:  # 그림 하나가 실패해도 나머지로 만든다
                print(f"그림 {i} 실패: {e}")
    if not images:
        if not material["thumbnail_key"]:
            raise RuntimeError("그림도 썸네일도 없다")
        source.download(material["thumbnail_key"], os.path.join(work, "thumb.png"))
        images = ["thumb.png"]

    fontdir = render.ensure_fonts(work)
    render.make_overlay(os.path.join(work, "overlay.png"), fontdir, pick["title"], material["title"])
    render.make_end_card(os.path.join(work, "endcard.png"), fontdir)
    cards = render.caption_cards(segs[start: end + 1], clip_start)
    render.write_ass(os.path.join(work, "captions.ass"), cards, speech_dur)
    render.render(work, images, audio, clip_start, speech_dur, "reel.mp4")

    meta = {
        "date": date,
        "episode_id": episode_id,
        "episode_title": material["title"],
        "title": pick["title"],
        "caption": pick["caption"],
        "reason": pick["reason"],
        "start_sec": round(clip_start, 2),
        "duration_sec": round(speech_dur + render.END_CARD_SEC, 1),
        "segments": [start, end],
        "images": "ai" if images[0] != "thumb.png" else "thumbnail",
    }
    with open(os.path.join(work, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(json.dumps(meta, ensure_ascii=False, indent=1))
    gh_output(date=date, episode=episode_id)
    if args.local:
        print(f"로컬 결과: {os.path.join(work, 'reel.mp4')}")
        return

    source.upload(os.path.join(work, "reel.mp4"), source.reels_key(date, "reel.mp4"), "video/mp4")
    source.upload(os.path.join(work, "meta.json"), source.reels_key(date, "meta.json"), "application/json")
    state["proposed"][episode_id] = date
    source.save_state(state)
    # 미리보기 주소는 공개 로그에 남기지 않는다(저장소가 공개라 Actions 로그도 공개다) — Slack 으로만 보낸다
    preview = source.presign(source.reels_key(date, "reel.mp4"), 12 * 3600)
    approve = f"\n승인하면 게시: {config.RUN_URL}" if config.RUN_URL else ""
    slack(
        f":clapper: *오늘의 릴스 후보* ({date})\n"
        f"편: {material['title']} · {meta['duration_sec']}초 · 그림 {meta['images']}\n"
        f"화면 문구: {pick['title']}\n고른 이유: {pick['reason']}\n"
        f"미리보기(12시간): {preview}\n\n캡션:\n```{pick['caption']}```{approve}"
    )


# ---------- publish ----------

def publish(args) -> None:
    date = args.date
    meta = source.read_json(source.reels_key(date, "meta.json"))
    state = source.load_state()
    posted = state["posted"].get(meta["episode_id"])
    if posted and posted.get("date") == date:
        print(f"이미 게시함: {posted.get('permalink')}")
        return
    # 인스타 서버가 받아 갈 주소 — 처리에 몇 분 걸리므로 1시간
    from instagram import publish_reel

    result = publish_reel(source.presign(source.reels_key(date, "reel.mp4"), 3600), meta["caption"])
    state["posted"][meta["episode_id"]] = {"date": date, **result}
    source.save_state(state)
    slack(f":white_check_mark: 릴스 게시 완료 ({date}) — {meta['episode_title']}\n{result['permalink']}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--date")
    b.add_argument("--episode")
    b.add_argument("--no-ai", action="store_true", help="모델 없이 첫 본문 단락으로")
    b.add_argument("--no-images", action="store_true", help="그림 대신 편 썸네일")
    b.add_argument("--local", action="store_true", help="S3 업로드·상태·Slack 없이 로컬에만")
    b.add_argument("--pick", help="사람이 고른 구간·문구 JSON 파일(모델 대신)")
    b.set_defaults(fn=build)
    pb = sub.add_parser("publish")
    pb.add_argument("--date", required=True)
    pb.set_defaults(fn=publish)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
