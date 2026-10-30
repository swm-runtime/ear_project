"""인스타그램 게시 — Instagram API with Instagram Login(프로페셔널 계정).

흐름: 릴스 컨테이너 생성(video_url) → 처리 완료까지 상태 조회 → 게시 → permalink 조회.
video_url 은 S3 사전 서명 주소다 — 인스타 서버가 직접 받아 간다.
토큰은 SSM SecureString 에 두고, 오래됐으면 게시 전에 갱신해 다시 저장한다(장기 토큰 60일).
"""
from __future__ import annotations

import datetime as dt
import time

import boto3
import requests

import config


def _base() -> str:
    return f"https://{config.IG_GRAPH_HOST}/{config.IG_API_VERSION}"


def _ssm():
    return boto3.client("ssm", region_name=config.AWS_REGION)


def access_token() -> str:
    """SSM 에서 토큰을 읽고, IG_TOKEN_REFRESH_DAYS 보다 오래됐으면 갱신해 덮어쓴다."""
    p = _ssm().get_parameter(Name=config.IG_TOKEN_PARAM, WithDecryption=True)["Parameter"]
    token = p["Value"]
    age = dt.datetime.now(dt.timezone.utc) - p["LastModifiedDate"]
    if age > dt.timedelta(days=config.IG_TOKEN_REFRESH_DAYS):
        res = requests.get(
            f"https://{config.IG_GRAPH_HOST}/refresh_access_token",
            params={"grant_type": "ig_refresh_token", "access_token": token},
            timeout=30,
        )
        if res.ok and res.json().get("access_token"):
            token = res.json()["access_token"]
            _ssm().put_parameter(Name=config.IG_TOKEN_PARAM, Value=token, Type="SecureString", Overwrite=True)
        else:
            # 갱신 실패는 게시를 막지 않는다 — 기존 토큰이 아직 살아 있을 수 있다. 사유만 남긴다
            print(f"토큰 갱신 실패 {res.status_code}: {res.text[:200]}")
    return token


def _check(res: requests.Response, what: str) -> dict:
    if res.status_code >= 400:
        raise RuntimeError(f"{what} 실패 {res.status_code}: {res.text[:400]}")
    return res.json()


def publish_reel(video_url: str, caption: str, timeout_sec: int = 900) -> dict:
    if not config.IG_USER_ID:
        raise RuntimeError("IG_USER_ID 가 없다")
    token = access_token()
    container = _check(
        requests.post(
            f"{_base()}/{config.IG_USER_ID}/media",
            data={
                "media_type": "REELS",
                "video_url": video_url,
                "caption": caption,
                "share_to_feed": "true",
                "access_token": token,
            },
            timeout=60,
        ),
        "릴스 컨테이너 생성",
    )["id"]

    deadline = time.time() + timeout_sec
    while True:
        status = _check(
            requests.get(
                f"{_base()}/{container}",
                params={"fields": "status_code,status", "access_token": token},
                timeout=30,
            ),
            "컨테이너 상태 조회",
        )
        code = status.get("status_code")
        if code == "FINISHED":
            break
        if code in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"인스타가 영상을 처리하지 못했다: {status}")
        if time.time() > deadline:
            raise RuntimeError(f"영상 처리가 {timeout_sec}초 안에 끝나지 않았다: {status}")
        time.sleep(10)

    media_id = _check(
        requests.post(
            f"{_base()}/{config.IG_USER_ID}/media_publish",
            data={"creation_id": container, "access_token": token},
            timeout=60,
        ),
        "게시",
    )["id"]
    info = _check(
        requests.get(f"{_base()}/{media_id}", params={"fields": "permalink", "access_token": token}, timeout=30),
        "permalink 조회",
    )
    return {"media_id": media_id, "permalink": info.get("permalink", "")}
