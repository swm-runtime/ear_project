"""영상 합성 — 그림(천천히 확대) + 위·아래 그라데이션과 제목 + 말소리에 맞춘 자막 + 파형 + 끝 카드."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import urllib.request
import zipfile

from PIL import Image, ImageDraw, ImageFont

import config

W, H, FPS = config.WIDTH, config.HEIGHT, config.FPS
XFADE = 0.8  # 그림 사이 겹침(초)
END_CARD_SEC = 2.8  # 말이 끝난 뒤 끝 카드
FONT_URL = "https://github.com/orioncactus/pretendard/releases/download/v1.3.9/Pretendard-1.3.9.zip"
FONT_FILES = ("Pretendard-Bold.otf", "Pretendard-ExtraBold.otf", "Pretendard-SemiBold.otf")
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "earcast-reels")

# 자막 — 한 줄 글자 수·한 카드 줄 수. 인스타 화면 아래쪽 UI(이름·캡션)를 피해 바닥에서 띄운다
LINE_CHARS = 13
CARD_LINES = 2
CAPTION_MARGIN_V = 470
WAVE_Y, WAVE_H = 1490, 110


def ensure_fonts(workdir: str) -> str:
    """Pretendard(OFL)를 고정 버전으로 받아 workdir/fonts 에 둔다. 자막(libass)과 PIL 이 같은 파일을 쓴다."""
    os.makedirs(CACHE, exist_ok=True)
    zpath = os.path.join(CACHE, "Pretendard-1.3.9.zip")
    if not os.path.exists(zpath):
        urllib.request.urlretrieve(FONT_URL, zpath)
    fontdir = os.path.join(workdir, "fonts")
    os.makedirs(fontdir, exist_ok=True)
    with zipfile.ZipFile(zpath) as z:
        for name in FONT_FILES:
            target = os.path.join(fontdir, name)
            if not os.path.exists(target):
                with z.open(f"public/static/{name}") as src, open(target, "wb") as dst:
                    shutil.copyfileobj(src, dst)
    return fontdir


def _font(fontdir: str, name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(os.path.join(fontdir, name), size)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int, max_lines: int) -> list[str]:
    lines, cur = [], ""
    for w in text.split():
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(".,") + "…"
    return lines


def _gradient(img: Image.Image, y0: int, y1: int, a0: int, a1: int) -> None:
    d = ImageDraw.Draw(img)
    for y in range(y0, y1):
        t = (y - y0) / max(1, y1 - y0 - 1)
        d.line([(0, y), (W, y)], fill=(*config.NAVY, int(a0 + (a1 - a0) * t)))


def make_overlay(path: str, fontdir: str, title: str, episode_title: str) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    _gradient(img, 0, 640, 235, 0)
    _gradient(img, 1080, H, 0, 235)
    d = ImageDraw.Draw(img)
    d.text((72, 150), "이어 · 매일 아침 듣는 AI 팟캐스트", font=_font(fontdir, "Pretendard-SemiBold.otf", 34),
           fill=(*config.IVORY, 200))
    small = _font(fontdir, "Pretendard-Bold.otf", 34)
    ep = _wrap(d, episode_title, small, W - 144, 1)
    d.text((72, 222), ep[0] if ep else "", font=small, fill=(*config.CORAL, 255))
    big = _font(fontdir, "Pretendard-ExtraBold.otf", 76)
    y = 280
    for line in _wrap(d, title, big, W - 144, 2):
        d.text((72, y), line, font=big, fill=(*config.IVORY, 255))
        y += 96
    img.save(path)


def make_end_card(path: str, fontdir: str) -> None:
    img = Image.new("RGBA", (W, H), (*config.NAVY, 238))
    d = ImageDraw.Draw(img)

    def center(text, font, y, fill):
        d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)

    center("전체 이야기는", _font(fontdir, "Pretendard-Bold.otf", 56), 760, (*config.IVORY, 255))
    center("'이어' 앱에서", _font(fontdir, "Pretendard-ExtraBold.otf", 96), 840, (*config.CORAL, 255))
    center("매일 아침, 내 관심사로 채워지는 AI 팟캐스트", _font(fontdir, "Pretendard-SemiBold.otf", 38), 990,
           (*config.IVORY, 220))
    center("프로필 링크에서 무료로 받기", _font(fontdir, "Pretendard-Bold.otf", 40), 1080, (*config.IVORY, 255))
    img.save(path)


# ---------- 자막 ----------

def _ass_color(rgb) -> str:
    r, g, b = rgb
    return f"&H00{b:02X}{g:02X}{r:02X}&"


def _ass_time(t: float) -> str:
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _lines(text: str) -> list[str]:
    """문장 → 한 줄 LINE_CHARS 이내 줄들(어절 단위)."""
    out, cur = [], ""
    for w in text.split():
        trial = f"{cur} {w}".strip()
        if len(trial) <= LINE_CHARS or not cur:
            cur = trial
        else:
            out.append(cur)
            cur = w
    if cur:
        out.append(cur)
    return out


def caption_cards(segments: list[dict], clip_start: float) -> list[tuple[float, float, str, str]]:
    """세그먼트(턴)를 화면 카드로 쪼갠다 — 카드마다 (시작, 끝, 화자, 줄바꿈된 글). 시간은 턴 안에서 글자 수에 비례."""
    cards = []
    for seg in segments:
        sentences = [s.strip() for s in re.split(r"(?<=[.?!…])\s+", seg["text"].strip()) if s.strip()]
        groups = []
        for sent in sentences:
            ls = _lines(sent)
            for i in range(0, len(ls), CARD_LINES):
                groups.append(ls[i: i + CARD_LINES])
        total = sum(len("".join(g)) for g in groups) or 1
        t = seg["start_sec"]
        span = seg["end_sec"] - seg["start_sec"]
        for g in groups:
            dur = span * len("".join(g)) / total
            cards.append((t - clip_start, t + dur - clip_start, seg["speaker"], "\\N".join(g)))
            t += dur
    return cards


def write_ass(path: str, cards, speech_end: float) -> None:
    head = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {W}\nPlayResY: {H}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding\n"
        f"Style: Cap,Pretendard,70,&H00FFFFFF,&H00FFFFFF,&H00261610,&H96000000,1,0,0,0,100,100,0,0,1,5,0,2,80,80,"
        f"{CAPTION_MARGIN_V},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    rows = []
    for start, end, speaker, text in cards:
        end = min(end, speech_end)
        if end - start < 0.05:
            continue
        color = _ass_color(config.SPEAKER_COLORS.get(speaker, config.IVORY))
        safe = text.replace("{", "(").replace("}", ")")
        label = "{\\fs38\\c" + color + "}" + speaker + "\\N{\\fs70\\c&H00FFFFFF&}"
        rows.append(f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Cap,,0,0,0,,{{\\fad(80,60)}}{label}{safe}")
    with open(path, "w", encoding="utf-8") as f:
        f.write(head + "\n".join(rows) + "\n")


# ---------- 합성 ----------

def render(workdir: str, images: list[str], audio: str, clip_start: float, speech_dur: float, out: str) -> None:
    """workdir 안의 상대 경로만 쓴다(ffmpeg 필터의 윈도 경로 이스케이프를 피한다). images·audio 도 workdir 기준 파일명."""
    total = speech_dur + END_CARD_SEC
    n = len(images)
    seg_len = total / n
    frames = int((seg_len + XFADE) * FPS) + 1
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for img in images:
        cmd += ["-loop", "1", "-framerate", str(FPS), "-t", f"{seg_len + XFADE:.3f}", "-i", img]
    cmd += ["-ss", f"{clip_start:.3f}", "-t", f"{speech_dur:.3f}", "-i", audio]
    cmd += ["-loop", "1", "-framerate", str(FPS), "-t", f"{total:.3f}", "-i", "overlay.png"]
    cmd += ["-loop", "1", "-framerate", str(FPS), "-t", f"{total:.3f}", "-i", "endcard.png"]
    a_in, ov_in, ec_in = n, n + 1, n + 2

    f = []
    for i in range(n):
        # 짝수 장은 다가가고 홀수 장은 물러난다 — 정지 화면처럼 보이지 않게
        zoom = f"1+0.10*on/{frames}" if i % 2 == 0 else f"1.10-0.10*on/{frames}"
        f.append(
            f"[{i}:v]scale={W * 3 // 2}:{H * 3 // 2}:force_original_aspect_ratio=increase,"
            f"crop={W * 3 // 2}:{H * 3 // 2},"
            f"zoompan=z='{zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS},"
            f"setsar=1,format=yuv420p[v{i}]"
        )
    last = "v0"
    for i in range(1, n):
        f.append(f"[{last}][v{i}]xfade=transition=fade:duration={XFADE}:offset={i * seg_len:.3f}[x{i}]")
        last = f"x{i}"
    f.append(f"[{last}]trim=duration={total:.3f},setpts=PTS-STARTPTS[bg]")
    f.append(f"[{ov_in}:v]format=rgba[ov]")
    f.append("[bg][ov]overlay=0:0[b1]")
    f.append(f"[{a_in}:a]aresample=48000,asplit[aw][ao]")
    f.append(
        # 말소리는 진폭이 작아 선형이면 거의 평평하다 — 세제곱근으로 키운다
        f"[aw]showwaves=s={W - 200}x{WAVE_H}:mode=cline:scale=cbrt:draw=full:rate={FPS}:colors=0xFF7A59,"
        "format=rgba,colorchannelmixer=aa=0.9[wv]"
    )
    f.append(f"[b1][wv]overlay=(W-w)/2:{WAVE_Y}:eof_action=pass[b2]")
    f.append("[b2]ass=captions.ass:fontsdir=fonts[b3]")
    f.append(f"[{ec_in}:v]format=rgba,fade=t=in:st={speech_dur:.3f}:d=0.4:alpha=1[ec]")
    f.append(f"[b3][ec]overlay=0:0:enable='gte(t,{speech_dur:.3f})'[vout]")
    f.append(
        f"[ao]afade=t=in:d=0.2,afade=t=out:st={max(0.0, speech_dur - 0.4):.3f}:d=0.4,"
        f"apad=whole_dur={total:.3f}[aout]"
    )
    with open(os.path.join(workdir, "filter.txt"), "w", encoding="utf-8") as fh:
        fh.write(";\n".join(f))
    cmd += [
        "-filter_complex_script", "filter.txt",
        "-map", "[vout]", "-map", "[aout]", "-t", f"{total:.3f}", "-r", str(FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-profile:v", "high",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out,
    ]
    subprocess.run(cmd, cwd=workdir, check=True)
