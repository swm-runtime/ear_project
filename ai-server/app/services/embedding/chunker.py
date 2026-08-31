"""대본 청킹 — 모델 입력 한도를 넘는 텍스트를 나눈다 (`docs/ai/metadata-pipeline.md` 4.3).

토큰이 아니라 문자 수 기준이다: 제공자·모델마다 토크나이저가 달라 토큰 기준을 여기 두면
모델 교체마다 규칙이 바뀐다. 한도는 env(`EMBEDDING_CHUNK_CHARS`)로 보수적으로 잡는다.
"""

from __future__ import annotations


def chunk_text(text: str, max_chars: int) -> list[str]:
    if max_chars <= 0:
        raise ValueError("max_chars must be positive")

    stripped = text.strip()

    if not stripped:
        raise ValueError("text must not be empty")

    if len(stripped) <= max_chars:
        return [stripped]

    chunks: list[str] = []
    remaining = stripped

    while remaining:
        if len(remaining) <= max_chars:
            chunks.append(remaining)
            break

        # 문장·단어 중간을 자르지 않게 한도 안의 마지막 공백에서 끊는다.
        # 공백이 없는 극단 입력은 한도에서 강제로 자른다 — 무한 루프를 만들지 않는다.
        cut = remaining.rfind(" ", 0, max_chars + 1)

        if cut <= 0:
            cut = max_chars

        chunks.append(remaining[:cut].rstrip())
        remaining = remaining[cut:].lstrip()

    return [chunk for chunk in chunks if chunk]
