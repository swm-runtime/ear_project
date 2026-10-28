"""OpenAI 호출 — 구간·문구 고르기(텍스트 모델)와 배경 그림(이미지 모델)."""
from __future__ import annotations

import base64
import json

import requests

import config

PICK_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["start_idx", "end_idx", "title", "caption", "image_prompts", "reason"],
    "properties": {
        "start_idx": {"type": "integer"},
        "end_idx": {"type": "integer"},
        "title": {"type": "string"},
        "caption": {"type": "string"},
        "image_prompts": {"type": "array", "items": {"type": "string"}},
        "reason": {"type": "string"},
    },
}

PICK_SYSTEM = """너는 AI 팟캐스트 '이어'의 인스타그램 릴스 편집자다. 한 편의 대화 대본에서 릴스 한 개로 자를 구간을 고르고 화면 문구와 캡션을 쓴다.
목표는 처음 보는 사람이 3초 안에 멈추고 끝까지 듣게 만드는 것이다.

구간 규칙:
- 아래 번호 목록에서 연속된 줄 하나의 구간(start_idx~end_idx, 양끝 포함)을 고른다. 길이는 {min}~{max}초.
- 앞 내용을 몰라도 이해되는 구간이어야 한다. "그래서", "아까 말한", "그 사람" 처럼 앞을 가리키는 말로 시작하는 줄에서 시작하지 않는다.
- 첫 줄은 궁금증·반전·구체적인 숫자나 사례로 시작하는 줄이 좋다. 끝은 결론이나 한 방이 있는 줄에서 끝낸다.

문구 규칙:
- title: 영상 위쪽에 계속 떠 있는 한 줄. 18자 이내, 질문형이나 반전형. 이모지·따옴표 금지.
- caption: 인스타 캡션. 첫 줄은 40자 이내 훅, 다음에 2~3문장 요약, 그다음 줄에 "전체 이야기는 '이어' 앱에서 들을 수 있어요.", 마지막 줄에 해시태그 5~8개(#이어 #팟캐스트 포함).
- 대본에 없는 사실·숫자를 만들지 않는다. 과장·낚시 문구 금지.

그림 규칙:
- image_prompts: 정확히 {n}개. 영어로, 구간 내용의 흐름을 순서대로 담은 장면 묘사 한 문장씩.
- 글자·숫자·로고가 들어가는 장면을 묘사하지 않는다. 사람 얼굴 클로즈업을 피한다.

reason: 이 구간을 고른 이유 한 문장(한국어)."""

IMAGE_STYLE = (
    "Vertical editorial illustration for a podcast reel. Calm, cinematic, soft film grain, gentle light. "
    "Palette: deep navy (#101626), warm off-white (#F6F1E8), coral accent (#FF7A59). "
    "Minimal, uncluttered composition with quiet empty space in the top and bottom thirds. "
    "Absolutely no text, letters, numbers, captions, logos or watermarks. Scene: "
)


def _headers() -> dict:
    if not config.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY 가 없다")
    return {"authorization": f"Bearer {config.OPENAI_API_KEY}", "content-type": "application/json"}


def _output_text(data: dict) -> str:
    for item in data.get("output", []):
        if item.get("type") != "message":
            continue
        for part in item.get("content", []):
            if part.get("type") == "output_text":
                return part.get("text", "")
    raise RuntimeError(f"모델 응답에 텍스트가 없다: {json.dumps(data)[:300]}")


def pick_clip(material: dict, candidates: list[dict]) -> dict:
    """candidates: [{idx, start_sec, end_sec, speaker, text}] — 인트로·마무리를 뺀 줄."""
    lines = "\n".join(
        f"[{c['idx']}] {c['start_sec']:.1f}~{c['end_sec']:.1f}s ({c['end_sec'] - c['start_sec']:.0f}초) {c['speaker']}: {c['text']}"
        for c in candidates
    )
    system = (
        PICK_SYSTEM.replace("{min}", f"{config.CLIP_MIN_SEC:.0f}")
        .replace("{max}", f"{config.CLIP_MAX_SEC:.0f}")
        .replace("{n}", str(config.IMAGE_COUNT))
    )
    user = f"편 제목: {material['title']}\n키워드: {', '.join(material['keywords'])}\n\n대본:\n{lines}"
    body = {
        "model": config.TEXT_MODEL,
        "input": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "text": {"format": {"type": "json_schema", "name": "reel_pick", "strict": True, "schema": PICK_SCHEMA}},
    }
    res = requests.post(f"{config.OPENAI_BASE_URL}/responses", headers=_headers(), json=body, timeout=300)
    if res.status_code >= 400:
        raise RuntimeError(f"구간 고르기 실패 {res.status_code}: {res.text[:300]}")
    return json.loads(_output_text(res.json()))


def generate_image(prompt: str, path: str) -> None:
    """재시도하지 않는다 — 한 번이 곧 과금이다(파이프라인 썸네일과 같은 원칙). 실패하면 썸네일로 대신한다."""
    body = {
        "model": config.IMAGE_MODEL,
        "prompt": IMAGE_STYLE + prompt,
        "size": config.IMAGE_SIZE,
        "quality": config.IMAGE_QUALITY,
        "n": 1,
    }
    res = requests.post(f"{config.OPENAI_BASE_URL}/images/generations", headers=_headers(), json=body, timeout=300)
    if res.status_code >= 400:
        raise RuntimeError(f"그림 생성 실패 {res.status_code}: {res.text[:300]}")
    item = res.json()["data"][0]
    if item.get("b64_json"):
        data = base64.b64decode(item["b64_json"])
    else:
        data = requests.get(item["url"], timeout=60).content
    with open(path, "wb") as f:
        f.write(data)
