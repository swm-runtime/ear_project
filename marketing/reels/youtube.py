"""이어 유튜브 업로드 — YouTube Data API v3 (videos.insert · thumbnails.set). 추가 의존성 없이 requests 만 쓴다.

  python youtube.py auth --client-secret client_secret.json   # 처음 한 번 — 브라우저에서 채널 계정으로 승인
  python youtube.py upload --manifest uploads.json            # 목록대로 올린다(기본 비공개)
  python youtube.py privacy public <영상ID> ...                # 확인한 뒤 공개로

자격(클라이언트 ID·시크릿·갱신 토큰)은 SSM SecureString 하나에 JSON 으로 둔다 — 화면·로그·커밋에 찍지 않는다.
manifest: [{"file", "title", "description", "tags": [], "privacy": "private|unlisted|public",
            "thumbnail"?, "publish_at"? (RFC3339, privacy=private 일 때만), "category_id"? (기본 27 교육)}]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import http.server
import json
import os
import secrets
import sys
import urllib.parse
import webbrowser

import boto3
import requests

import config

PARAM = os.environ.get("YT_OAUTH_PARAM", "/earcast/reels/yt-oauth")
# 업로드 + 공개 범위 변경(videos.update 는 youtube.upload 로 안 된다)
SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
THUMB_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"


def ssm():
    return boto3.client("ssm", region_name=config.AWS_REGION)


# ---------- auth ----------

def auth(args) -> None:
    with open(args.client_secret, encoding="utf-8") as f:
        raw = json.load(f)
    c = raw.get("installed") or raw.get("web") or raw
    client_id, client_secret = c["client_id"], c["client_secret"]

    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    got: dict = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            got.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write("승인 완료 — 이 창은 닫아도 됩니다.".encode())

        def log_message(self, *a):  # 코드가 콘솔에 찍히지 않게
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    redirect = f"http://127.0.0.1:{srv.server_port}"
    url = AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect, "response_type": "code", "scope": SCOPE,
        "access_type": "offline", "prompt": "consent", "state": state,
        "code_challenge": challenge, "code_challenge_method": "S256",
    })
    print("브라우저에서 유튜브 채널 계정으로 로그인해 승인하세요. 창이 안 뜨면 이 주소를 여세요:\n" + url)
    webbrowser.open(url)
    while "code" not in got and "error" not in got:
        srv.handle_request()
    if got.get("error") or got.get("state") != state:
        sys.exit(f"승인 실패: {got.get('error') or 'state 불일치'}")
    res = requests.post(TOKEN_URL, data={
        "client_id": client_id, "client_secret": client_secret, "code": got["code"], "code_verifier": verifier,
        "grant_type": "authorization_code", "redirect_uri": redirect,
    }, timeout=30)
    res.raise_for_status()
    refresh = res.json().get("refresh_token")
    if not refresh:
        sys.exit("갱신 토큰이 오지 않았다 — 계정 권한에서 앱 접근을 지우고 다시 승인")
    ssm().put_parameter(Name=PARAM, Type="SecureString", Overwrite=True, Value=json.dumps(
        {"client_id": client_id, "client_secret": client_secret, "refresh_token": refresh}))
    print(f"저장 완료: SSM {PARAM}")


class NoCredentials(Exception):
    """SSM 에 OAuth 자격이 없다 — 아직 auth 를 하지 않았다."""


def access_token() -> str:
    try:
        raw = ssm().get_parameter(Name=PARAM, WithDecryption=True)["Parameter"]["Value"]
    except ssm().exceptions.ParameterNotFound as e:
        raise NoCredentials(PARAM) from e
    cred = json.loads(raw)
    res = requests.post(TOKEN_URL, data={
        "client_id": cred["client_id"], "client_secret": cred["client_secret"],
        "refresh_token": cred["refresh_token"], "grant_type": "refresh_token",
    }, timeout=30)
    res.raise_for_status()
    return res.json()["access_token"]


# ---------- upload ----------

def upload_one(token: str, item: dict) -> dict:
    path = item["file"]
    status = {
        "privacyStatus": item.get("privacy", "private"),
        "selfDeclaredMadeForKids": False,
        # 진행자 목소리·대본이 AI 생성 — 인스타 'AI 레이블'과 같은 표시
        "containsSyntheticMedia": True,
    }
    if item.get("publish_at"):
        status["publishAt"] = item["publish_at"]
    body = {
        "snippet": {
            "title": item["title"][:100],
            "description": item.get("description", "")[:5000],
            "tags": item.get("tags", []),
            "categoryId": str(item.get("category_id", 27)),
            "defaultLanguage": "ko",
            "defaultAudioLanguage": "ko",
        },
        "status": status,
    }
    size = os.path.getsize(path)
    h = {"Authorization": f"Bearer {token}"}
    init = requests.post(UPLOAD_URL, params={"uploadType": "resumable", "part": "snippet,status"},
                         headers={**h, "Content-Type": "application/json; charset=UTF-8",
                                  "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)},
                         data=json.dumps(body), timeout=60)
    init.raise_for_status()
    with open(path, "rb") as f:
        res = requests.put(init.headers["Location"], headers={**h, "Content-Type": "video/mp4"}, data=f, timeout=3600)
    res.raise_for_status()
    vid = res.json()["id"]
    out = {"file": path, "id": vid, "url": f"https://youtu.be/{vid}", "privacy": status["privacyStatus"]}
    if item.get("thumbnail"):
        with open(item["thumbnail"], "rb") as f:
            t = requests.post(THUMB_URL, params={"videoId": vid}, headers={**h, "Content-Type": "image/jpeg"},
                              data=f, timeout=120)
        # 썸네일은 휴대폰 인증된 채널만 된다 — 실패해도 영상은 올라간 것
        out["thumbnail"] = "ok" if t.ok else f"실패 {t.status_code}: {t.text[:200]}"
    return out


def upload(args) -> None:
    with open(args.manifest, encoding="utf-8") as f:
        items = json.load(f)
    token = access_token()
    results = []
    for item in items:
        try:
            r = upload_one(token, item)
        except requests.HTTPError as e:
            r = {"file": item["file"], "error": f"{e.response.status_code}: {e.response.text[:300]}"}
        print(json.dumps(r, ensure_ascii=False))
        results.append(r)
        if "error" in r and "quota" in r["error"].lower():
            break
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)


def set_privacy(args) -> None:
    """올린 영상의 공개 범위를 바꾼다 — status 를 통째로 다시 쓰므로 AI 표시·아동용 값도 함께 보낸다."""
    token = access_token()
    h = {"Authorization": f"Bearer {token}"}
    for vid in args.ids:
        body = {"id": vid, "status": {"privacyStatus": args.privacy, "selfDeclaredMadeForKids": False,
                                      "containsSyntheticMedia": True}}
        res = requests.put(VIDEOS_URL, params={"part": "status"}, headers={**h, "Content-Type": "application/json"},
                           data=json.dumps(body), timeout=60)
        print(vid, res.status_code, res.json().get("status", {}).get("privacyStatus") if res.ok else res.text[:300])


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("auth")
    a.add_argument("--client-secret", required=True, help="콘솔에서 받은 OAuth 클라이언트(데스크톱 앱) JSON")
    a.set_defaults(fn=auth)
    u = sub.add_parser("upload")
    u.add_argument("--manifest", required=True)
    u.add_argument("--out", help="결과(영상 ID·주소) 저장 파일")
    u.set_defaults(fn=upload)
    v = sub.add_parser("privacy")
    v.add_argument("privacy", choices=["private", "unlisted", "public"])
    v.add_argument("ids", nargs="+", help="영상 ID")
    v.set_defaults(fn=set_privacy)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
