"""
A21 콘텐츠 언어 선택 카드의 배경 국기(흐린 PNG)를 만든다 — KAN-195, PM 2026-10-19.

    python scripts/generate-language-flags.py     # frontend/ 에서 실행. Pillow 필요(pip install pillow)

왜 미리 흐린 이미지인가: 앱에서 흐리게 하면 Android 는 expo-image `blurRadius` 가 RenderScript 를 타 동시 사용 시
죽는다(EAR-APP-F, 2026-10-09). 네이티브 모듈을 더하면 OTA 로 못 나간다. 그래서 흐림은 여기서 끝내고 앱은 RN `Image`
로 깔기만 한다(design.md §5 "장식 배경 이미지").

국기는 규격대로 그린 뒤 흐린다(흐리면 거의 안 보이지만 모양·비율이 틀린 국기를 깔지 않는다).
- 태극기: 대한민국국기법 시행령 별표 — 가로:세로 3:2, 태극 지름 = 세로의 1/2, 괘 길이 = 지름의 1/2,
  괘 막대 너비 = 지름의 1/12, 막대·끊김 간격 = 지름의 1/24, 괘는 태극에서 지름의 1/4 떨어진다.
  건(☰) 왼쪽 위 · 곤(☷) 오른쪽 아래 · 감(☵) 오른쪽 위 · 리(☲) 왼쪽 아래. 빨강 위 · 파랑 아래.
  색: 빨강 #CD2E3A · 파랑 #0047A0 · 검정 · 흰색(2021 국기 색 기준의 sRGB 근삿값).
- 성조기: Executive Order 10834 — 세로 1 : 가로 1.9, 줄 13(위 빨강), 캔턴 0.5385 × 0.76, 별 50(6·5 교대 9줄),
  별 지름 0.0616, 간격 E=F 0.054 · G=H 0.063. 색: Old Glory Red #B31942 · Blue #0A3161.

출력은 카드 비율(가로가 긴 띠)에 가까운 3:1 로 가운데를 잘라 둔다 — 카드는 `resizeMode="cover"` 로 마저 자른다.
크게 흐린 그림이라 해상도가 낮아도 확대 티가 나지 않는다(420×140, 한 장 수십 KB).
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "flags"

# 출력 크기 — 3:1 띠
OUT_W, OUT_H = 420, 140
# 그리기 해상도(계단 현상을 줄이려고 크게 그린 뒤 줄인다)
DRAW_H = 1200
# 흐림 세기 — 국기 세로 길이 대비 가우시안 반경. 괘·별·줄이 형태를 잃고 색 덩어리로 남는 정도
BLUR_RATIO = 0.055

KR_RED = (205, 46, 58)
KR_BLUE = (0, 71, 160)
US_RED = (179, 25, 66)
US_BLUE = (10, 49, 97)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)


def draw_korea(h: int) -> Image.Image:
    w = h * 3 // 2
    img = Image.new("RGB", (w, h), WHITE)
    d = ImageDraw.Draw(img)
    cx, cy = w / 2, h / 2
    diameter = h / 2
    r = diameter / 2

    # 태극 — 왼쪽 위 ↔ 오른쪽 아래 대각선으로 원을 나누고, 그 대각선 위 작은 원(반지름 r/2) 둘로 S 를 만든다.
    # 대각선 위쪽(오른쪽 위 반원)이 빨강, 아래쪽이 파랑. 왼쪽 위 작은 원은 빨강, 오른쪽 아래 작은 원은 파랑
    # (빨강 머리가 왼쪽 — 왼쪽에서 빨강이 아래로 불룩, 파랑 머리가 오른쪽 — 오른쪽에서 파랑이 위로 불룩. PM 대조 2026-10-19).
    angle = math.atan2(h, w)  # 대각선 기울기(화면 좌표: 오른쪽 아래로 내려간다)
    ux, uy = math.cos(angle), math.sin(angle)  # 왼쪽 위 → 오른쪽 아래 단위 벡터
    deg = math.degrees(angle)
    bbox = (cx - r, cy - r, cx + r, cy + r)
    # PIL 각도는 3시 방향 0°에서 시계 방향. 대각선 방향 deg ~ deg+180 이 아래쪽(왼쪽 아래) 반원
    d.pieslice(bbox, deg, deg + 180, fill=KR_BLUE)
    d.pieslice(bbox, deg + 180, deg + 360, fill=KR_RED)
    sr = r / 2
    ul = (cx - ux * sr, cy - uy * sr)
    lr = (cx + ux * sr, cy + uy * sr)
    d.ellipse((ul[0] - sr, ul[1] - sr, ul[0] + sr, ul[1] + sr), fill=KR_RED)
    d.ellipse((lr[0] - sr, lr[1] - sr, lr[0] + sr, lr[1] + sr), fill=KR_BLUE)

    # 괘 — 막대 길이 지름/2, 너비 지름/12, 간격 지름/24. 막대 길이 방향은 대각선에 수직
    bar_len = diameter / 2
    bar_w = diameter / 12
    gap = diameter / 24
    thickness = bar_w * 3 + gap * 2
    center_dist = r + diameter / 4 + thickness / 2

    def trigram(direction: tuple[float, float], pattern: tuple[bool, bool, bool]) -> None:
        """direction: 태극 중심에서 괘 쪽 단위 벡터. pattern: 안쪽부터 막대가 끊겼는지"""
        dx, dy = direction
        px, py = -dy, dx  # 막대 길이 방향(대각선에 수직)
        gx, gy = cx + dx * center_dist, cy + dy * center_dist
        for i, broken in enumerate(pattern):
            offset = -thickness / 2 + bar_w / 2 + i * (bar_w + gap)  # 안쪽(-) → 바깥(+)
            bx, by = gx + dx * offset, gy + dy * offset
            segments = (
                [(-bar_len / 2, -gap / 2), (gap / 2, bar_len / 2)] if broken else [(-bar_len / 2, bar_len / 2)]
            )
            for s0, s1 in segments:
                corners = []
                for along, across in ((s0, -bar_w / 2), (s1, -bar_w / 2), (s1, bar_w / 2), (s0, bar_w / 2)):
                    corners.append((bx + px * along + dx * across, by + py * along + dy * across))
                d.polygon(corners, fill=BLACK)

    # 왼쪽 위·오른쪽 아래 대각선, 오른쪽 위·왼쪽 아래 대각선
    vx, vy = math.cos(angle), math.sin(angle)
    trigram((-vx, -vy), (False, False, False))  # 건 ☰ 왼쪽 위
    trigram((vx, vy), (True, True, True))  # 곤 ☷ 오른쪽 아래
    trigram((vx, -vy), (True, False, True))  # 감 ☵ 오른쪽 위(대칭이라 안팎 순서 무관)
    trigram((-vx, vy), (False, True, False))  # 리 ☲ 왼쪽 아래
    return img


def star_points(cx: float, cy: float, outer: float) -> list[tuple[float, float]]:
    inner = outer * math.sin(math.radians(18)) / math.sin(math.radians(54))
    pts = []
    for k in range(10):
        rad = outer if k % 2 == 0 else inner
        a = math.radians(-90 + k * 36)
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts


def draw_us(h: int) -> Image.Image:
    w = round(h * 1.9)
    img = Image.new("RGB", (w, h), WHITE)
    d = ImageDraw.Draw(img)
    stripe = h / 13
    for i in range(13):
        if i % 2 == 0:
            d.rectangle((0, i * stripe, w, (i + 1) * stripe), fill=US_RED)
    canton_w, canton_h = 0.76 * h, 7 * stripe
    d.rectangle((0, 0, canton_w, canton_h), fill=US_BLUE)
    e = f = 0.054 * h
    g = hh = 0.063 * h
    outer = 0.0616 * h / 2
    for row in range(9):
        y = e + row * f
        cols = range(0, 11, 2) if row % 2 == 0 else range(1, 10, 2)
        for col in cols:
            d.polygon(star_points(g + col * hh, y, outer), fill=WHITE)
    return img


def soften(flag: Image.Image) -> Image.Image:
    """흐리고 가운데를 3:1 로 잘라 출력 크기로 줄인다"""
    work_h = 360
    work = flag.resize((round(flag.width * work_h / flag.height), work_h), Image.LANCZOS)
    work = work.filter(ImageFilter.GaussianBlur(work_h * BLUR_RATIO))
    crop_h = work.width / 3
    top = (work.height - crop_h) / 2
    band = work.crop((0, round(top), work.width, round(top + crop_h)))
    return band.resize((OUT_W, OUT_H), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, flag in (("flag-ko.png", draw_korea(DRAW_H)), ("flag-en.png", draw_us(DRAW_H))):
        path = OUT_DIR / name
        soften(flag).save(path, optimize=True)
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
