import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { THUMBNAIL_MAX_EDGE_PX } from './admin.constant';
import { UploadedFileInput } from './admin.types';
import { ThumbnailImage } from './thumbnail-image';

describe('ThumbnailImage — 썸네일 저장 규격 변환(admin-api.md 4.6)', () => {
  let dir: string;
  const image = new ThumbnailImage();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ear-thumb-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function writePng(
    name: string,
    width: number,
    height: number,
  ): Promise<UploadedFileInput> {
    const path = join(dir, name);
    // 단색이 아니라 그라데이션+줄무늬를 깐다 — 단색 PNG 는 원본부터 작아서 "줄었다"를 증명하지
    // 못하고, 주기적 노이즈는 PNG 가 오히려 더 잘 눌러 실제 그림(파이프라인 일러스트)과 반대로 나온다
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 3;
        raw[offset] = Math.round((x / width) * 255);
        raw[offset + 1] = Math.round((y / height) * 255);
        raw[offset + 2] = Math.round(
          (Math.sin(x / 9) * Math.cos(y / 13) + 1) * 127,
        );
      }
    }
    await sharp(raw, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(path);

    return {
      path,
      originalName: name,
      mimeType: 'image/png',
      size: statSync(path).size,
    };
  }

  it('1024×1024 PNG 를 긴 변 768px WebP 로 줄여 원본 옆에 쓴다', async () => {
    const input = await writePng('thumb.png', 1024, 1024);

    const result = await image.normalize(input);

    expect(result).not.toBeNull();
    expect(result!.extension).toBe('webp');
    expect(result!.width).toBe(THUMBNAIL_MAX_EDGE_PX);
    expect(result!.height).toBe(THUMBNAIL_MAX_EDGE_PX);
    expect(result!.file.path).toBe(`${input.path}.webp`);
    expect(result!.file.mimeType).toBe('image/webp');
    expect(result!.file.size).toBeLessThan(input.size);

    const stored = await sharp(result!.file.path).metadata();
    expect(stored.format).toBe('webp');
    expect(stored.width).toBe(THUMBNAIL_MAX_EDGE_PX);
  });

  it('가로가 긴 원본은 자르지 않고 비율을 지킨 채 긴 변만 768px 로 맞춘다', async () => {
    const input = await writePng('wide.png', 1600, 800);

    const result = await image.normalize(input);

    expect(result!.width).toBe(THUMBNAIL_MAX_EDGE_PX);
    expect(result!.height).toBe(THUMBNAIL_MAX_EDGE_PX / 2);
  });

  it('768px 보다 작은 원본은 키우지 않고 형식만 WebP 로 바꾼다', async () => {
    const input = await writePng('small.png', 300, 200);

    const result = await image.normalize(input);

    expect(result!.width).toBe(300);
    expect(result!.height).toBe(200);
    expect(result!.extension).toBe('webp');
  });

  it('이미지가 아닌 파일은 null — 확장자만 맞춘 파일을 저장소에 올리지 않는다', async () => {
    const path = join(dir, 'fake.png');
    writeFileSync(path, 'this is not an image');

    const result = await image.normalize({
      path,
      originalName: 'fake.png',
      mimeType: 'image/png',
      size: 20,
    });

    expect(result).toBeNull();
  });
});
