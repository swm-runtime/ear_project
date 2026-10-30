"""원본 읽기 — 발행된 편 목록(Supabase)과 편별 재료(S3), 그리고 릴스 상태 파일(S3)."""
from __future__ import annotations

import datetime as dt
import json
from dataclasses import dataclass

import boto3
import requests
from botocore.exceptions import ClientError

import config

_s3 = None


def s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name=config.AWS_REGION)
    return _s3


def read_json(key: str):
    body = s3().get_object(Bucket=config.PIPELINE_BUCKET, Key=key)["Body"].read()
    return json.loads(body)


def exists(key: str) -> bool:
    try:
        s3().head_object(Bucket=config.PIPELINE_BUCKET, Key=key)
        return True
    except ClientError:
        return False


def download(key: str, path: str) -> None:
    s3().download_file(config.PIPELINE_BUCKET, key, path)


def reels_key(*parts: str) -> str:
    return "/".join([config.REELS_PREFIX, *parts])


def upload(path: str, key: str, content_type: str) -> None:
    s3().upload_file(path, config.PIPELINE_BUCKET, key, ExtraArgs={"ContentType": content_type})


def presign(key: str, seconds: int) -> str:
    return s3().generate_presigned_url(
        "get_object", Params={"Bucket": config.PIPELINE_BUCKET, "Key": key}, ExpiresIn=seconds
    )


# ---------- 상태 파일 ----------
# {"proposed": {episode_id: "YYYY-MM-DD"}, "posted": {episode_id: {"date", "media_id", "permalink"}}}

def load_state() -> dict:
    try:
        state = read_json(reels_key("state.json"))
    except ClientError:
        state = {}
    state.setdefault("proposed", {})
    state.setdefault("posted", {})
    return state


def save_state(state: dict) -> None:
    s3().put_object(
        Bucket=config.PIPELINE_BUCKET,
        Key=reels_key("state.json"),
        Body=json.dumps(state, ensure_ascii=False, indent=1).encode(),
        ContentType="application/json",
    )


# ---------- 발행된 편 ----------

@dataclass
class Episode:
    id: str
    backlog_id: str
    published_at: str


def _supabase(path: str, params: dict) -> list:
    if not (config.SUPABASE_URL and config.SUPABASE_KEY):
        raise RuntimeError("SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 없다 — 발행된 편을 알 수 없다")
    headers = {"apikey": config.SUPABASE_KEY, "authorization": f"Bearer {config.SUPABASE_KEY}"}
    res = requests.get(f"{config.SUPABASE_URL}/rest/v1/{path}", params=params, headers=headers, timeout=30)
    res.raise_for_status()
    return res.json()


def _published_by_audio() -> list[Episode]:
    """Supabase 자격이 없을 때 — 발행 업로드는 dist.m4a 를 운영 오디오 버킷에 바이트 그대로 복사한다.
    그래서 파이프라인 dist.m4a 의 크기가 운영 버킷 .m4a 크기 중에 있으면 발행된 편으로 본다(2026-10-30 실측:
    알려진 발행 12편 전부 일치, 초안·미발행은 불일치). 발행 시각은 운영 객체의 업로드 시각."""
    s3c = s3()
    prod: dict[int, str] = {}
    for page in s3c.get_paginator("list_objects_v2").paginate(Bucket=config.AUDIO_BUCKET, Prefix="audio/"):
        for o in page.get("Contents", []):
            if o["Key"].endswith(".m4a"):
                t = o["LastModified"].isoformat()
                prod[o["Size"]] = max(prod.get(o["Size"], ""), t)
    out = []
    for page in s3c.get_paginator("list_objects_v2").paginate(Bucket=config.PIPELINE_BUCKET, Prefix="episodes/"):
        for o in page.get("Contents", []):
            if not o["Key"].endswith("/audio/dist.m4a"):
                continue
            ep = o["Key"].split("/")[1]
            # 글로벌판(G…)은 영어라 한국어 계정에 올리지 않는다
            if not ep.startswith("G") and o["Size"] in prod:
                out.append(Episode(ep, ep, prod[o["Size"]]))
    return sorted(out, key=lambda e: e.published_at, reverse=True)


def published_episodes() -> list[Episode]:
    """앱에 지금 나가 있는 한국판 편 — 최근 발행 순. 후보(backlog) 하나에 대본 버전이 여럿이면 오디오가 있는 가장 최근 것."""
    if not (config.SUPABASE_URL and config.SUPABASE_KEY):
        return _published_by_audio()
    try:
        return _published_by_supabase()
    except Exception as e:  # 자격이 틀렸거나 비어 있어도 매일 게시는 멈추지 않는다
        print(f"Supabase 조회 실패 — 운영 오디오 버킷으로 가린다: {type(e).__name__}")
        return _published_by_audio()


def _published_by_supabase() -> list[Episode]:
    backlogs = _supabase(
        "backlog",
        {"select": "id,published_at", "status": "eq.published", "order": "published_at.desc", "limit": "500"},
    )
    if not backlogs:
        return []
    published_at = {b["id"]: b.get("published_at") or "" for b in backlogs}
    ids = ",".join(f'"{b}"' for b in published_at)
    rows = _supabase(
        "episodes",
        {
            "select": "id,backlog_id,audio_dist_key,created_at",
            "backlog_id": f"in.({ids})",
            "audio_dist_key": "not.is.null",
            "order": "created_at.desc",
        },
    )
    latest: dict[str, Episode] = {}
    for r in rows:
        # 글로벌판(G…)은 영어라 한국어 계정에 올리지 않는다
        if r["id"].startswith("G") or r["backlog_id"] in latest:
            continue
        latest[r["backlog_id"]] = Episode(r["id"], r["backlog_id"], published_at.get(r["backlog_id"], ""))
    return sorted(latest.values(), key=lambda e: e.published_at, reverse=True)


def choose_episode(state: dict, today: dt.date) -> Episode | None:
    cutoff = today - dt.timedelta(days=config.REPROPOSE_AFTER_DAYS)
    for ep in published_episodes():
        if ep.id in state["posted"]:
            continue
        proposed = state["proposed"].get(ep.id)
        if proposed and dt.date.fromisoformat(proposed) > cutoff:
            continue
        base = f"episodes/{ep.id}"
        if exists(f"{base}/script-segments.json") and audio_key(ep.id):
            return ep
    return None


def audio_key(episode_id: str) -> str | None:
    """배포본 오디오 — dist.m4a, 없으면 구 dist.mp3 (spec/07)."""
    for name in ("dist.m4a", "dist.mp3"):
        key = f"episodes/{episode_id}/audio/{name}"
        if exists(key):
            return key
    return None


def episode_material(episode_id: str) -> dict:
    base = f"episodes/{episode_id}"
    meta = read_json(f"{base}/upload-meta.json") if exists(f"{base}/upload-meta.json") else {}
    sections = read_json(f"{base}/script-sections.json") if exists(f"{base}/script-sections.json") else []
    keywords = []
    if exists(f"{base}/enrichment.json"):
        keywords = read_json(f"{base}/enrichment.json").get("keywords") or []
    return {
        "id": episode_id,
        "title": meta.get("title") or episode_id,
        "segments": read_json(f"{base}/script-segments.json"),
        "sections": sections,
        "keywords": keywords,
        "one_liner": meta.get("one_liner") or "",
        "audio_key": audio_key(episode_id),
        # 글자 없는 원본 그림을 먼저 — 시리즈 표지(thumbnail.png)는 글자가 9:16 으로 잘려 자막과 겹친다
        "thumbnail_key": next((f"{base}/{n}" for n in ("thumbnail-raw.png", "thumbnail.png") if exists(f"{base}/{n}")), None),
    }
