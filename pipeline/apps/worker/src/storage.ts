import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { cfg } from "./config.js";
import { exists, log } from "./util.js";

/**
 * 산출물 저장소 — 파이프라인 S3 (spec/08 2장 · spec/10 3.3, M4).
 *
 * 원본은 S3, WORK_ROOT 는 그 로컬 캐시다. 키는 `s3:episodes/T260901-001/script.md` 처럼 버킷 안 경로 그대로이고
 * 로컬 경로는 `WORK_ROOT/<같은 경로>` — 레이아웃이 같아서 `claude -p` 가 읽고 쓰는 파일과 S3 객체가 1:1 이다.
 *
 * 두 백엔드:
 * - direct — AWS SDK 로 직접. 자격증명은 SDK 기본 체인(EC2 인스턴스 역할 `ear-ai-ec2`, 개발 중엔 임대 보유자 SSO 프로필 `AWS_PROFILE`).
 * - web    — 웹의 `/api/storage` 가 내주는 서명 URL 로 통신. 팀원 노트북 기본 — **노트북에 AWS 키를 두지 않는다**.
 *
 * 동기화 규칙: 파일의 md5 와 S3 ETag 를 비교해 다른 것만 옮긴다 (단일 PUT + SSE-S3 객체의 ETag = md5. 멀티파트는
 * ETag 가 달라 다시 올리지만 결과는 같다). 단계 전 pull → 실행 → 후 push. pull 은 로컬에만 있는 파일을 지우지 않는다
 * (죽은 실행이 남긴 미업로드분은 다음 push 가 올린다).
 */

export interface RemoteObject { key: string; etag: string; size: number; lastModified?: Date }

interface Backend {
  readonly kind: "direct" | "web";
  describe(): string;
  list(prefix: string, max?: number): Promise<RemoteObject[]>;
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

const ALLOWED_PREFIX = /^(episodes|sweeps|datasets)\//;
/** 버킷 정책·IAM 정책과 같은 범위만 (setup-pipeline-bucket.sh) — 밖의 키는 코드 버그다 */
export function assertKey(key: string): string {
  if (!ALLOWED_PREFIX.test(key) || key.includes("//") || key.split("/").includes("..") || key.length > 1024) throw new Error(`허용되지 않는 저장소 키: ${key}`);
  return key;
}

class DirectBackend implements Backend {
  readonly kind = "direct" as const;
  private client: S3Client;
  constructor(private bucket: string, private region: string) {
    // WHEN_REQUIRED: 기본값(WHEN_SUPPORTED)은 PUT 마다 CRC 체크섬 헤더를 붙인다 — 서명 URL·프록시 경로와 형태를 맞추기 위해 끈다
    this.client = new S3Client({ region, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  }
  describe() { return `direct s3://${this.bucket} (${this.region})`; }
  async list(prefix: string, max = 100_000): Promise<RemoteObject[]> {
    const out: RemoteObject[] = [];
    let token: string | undefined;
    do {
      const r = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: Math.min(1000, max - out.length) }));
      for (const o of r.Contents ?? []) if (o.Key) out.push({ key: o.Key, etag: (o.ETag ?? "").replace(/"/g, ""), size: o.Size ?? 0, lastModified: o.LastModified });
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token && out.length < max);
    return out;
  }
  async get(key: string): Promise<Buffer> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
}

class WebBackend implements Backend {
  readonly kind = "web" as const;
  constructor(private base: string, private token: string) {}
  describe() { return `web ${this.base}/api/storage`; }
  private async call<T>(op: string, params: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/api/storage`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` }, body: JSON.stringify({ op, ...params }) });
    } catch (e: any) { throw new Error(`웹 저장소 라우트에 연결 실패 (${this.base}): ${e?.message ?? e}`); }
    if (!res.ok) throw new Error(`웹 저장소 라우트 ${op} 실패: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }
  async list(prefix: string, max = 100_000): Promise<RemoteObject[]> {
    const r = await this.call<{ objects: { key: string; etag: string; size: number; last_modified: string | null }[] }>("list", { prefix, max });
    return r.objects.map((o) => ({ key: o.key, etag: o.etag, size: o.size, lastModified: o.last_modified ? new Date(o.last_modified) : undefined }));
  }
  async get(key: string): Promise<Buffer> {
    const { url } = await this.call<{ url: string }>("get", { key });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`S3 GET ${key}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  async put(key: string, body: Buffer, contentType: string) {
    const { url } = await this.call<{ url: string }>("put", { key, content_type: contentType });
    const res = await fetch(url, { method: "PUT", headers: { "content-type": contentType }, body: new Uint8Array(body) }); // Buffer 는 BodyInit 타입이 아니라 복사
    if (!res.ok) throw new Error(`S3 PUT ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

let backend: Backend | null = null;
export function storage(): Backend {
  if (backend) return backend;
  if (cfg.storageMode === "web") {
    if (!cfg.webUrl || !cfg.workerToken) throw new Error("S3_MODE=web 인데 PIPELINE_WEB_URL 또는 PIPELINE_WORKER_TOKEN 이 없습니다 (apps/worker/.env.example)");
    backend = new WebBackend(cfg.webUrl, cfg.workerToken);
  } else {
    if (!cfg.bucket) throw new Error("S3_MODE=direct 인데 PIPELINE_BUCKET 이 없습니다. 노트북이면 PIPELINE_WEB_URL·PIPELINE_WORKER_TOKEN 으로 web 모드를 쓴다 (apps/worker/.env.example)");
    backend = new DirectBackend(cfg.bucket, cfg.awsRegion);
  }
  return backend;
}

/** 기동 시 접근 확인 — 못 읽으면 작업을 집기 전에 죽는다 (규칙 자산과 같은 fail-loud). 반환: 사람이 읽는 백엔드 설명 */
export async function probeStorage(): Promise<string> {
  const s = storage();
  try { await s.list("episodes/", 1); }
  catch (e: any) { throw new Error(`산출물 저장소(${s.describe()})에 접근할 수 없습니다: ${e?.message ?? e}`); }
  return s.describe();
}

export const md5 = (b: Buffer) => crypto.createHash("md5").update(b).digest("hex");
async function fileMd5(p: string): Promise<string | null> {
  try { return md5(await fs.readFile(p)); } catch { return null; }
}

export function contentTypeOf(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return ({ ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".jsonl": "application/x-ndjson" } as Record<string, string>)[ext] ?? "application/octet-stream";
}

/** 디렉토리의 파일을 상대 경로("/" 구분)로 — 점으로 시작하는 파일·디렉토리(.DS_Store 등)는 제외 */
export async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const rec = async (d: string, rel: string) => {
    let ents: import("node:fs").Dirent[];
    try { ents = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith(".")) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await rec(path.join(d, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  await rec(dir, "");
  return out.sort();
}

/** S3 `keyPrefix/` → 로컬 디렉토리. md5 == ETag 면 건너뛴다. 내려받은 파일의 mtime 은 S3 LastModified 로 맞춘다(재집기 판정이 시각을 본다) */
export async function pullDir(keyPrefix: string, localDir: string): Promise<RemoteObject[]> {
  assertKey(keyPrefix);
  const objs = await storage().list(keyPrefix);
  let n = 0;
  for (const o of objs) {
    const rel = o.key.slice(keyPrefix.length);
    if (!rel || rel.endsWith("/")) continue;
    const local = path.join(localDir, rel);
    if ((await fileMd5(local)) === o.etag) continue;
    const body = await storage().get(o.key);
    await fs.mkdir(path.dirname(local), { recursive: true });
    await fs.writeFile(local, body);
    if (o.lastModified) await fs.utimes(local, o.lastModified, o.lastModified).catch(() => {});
    n++;
  }
  if (n) log(`  ⇩ ${keyPrefix} ${n}/${objs.length} 파일 내려받음`);
  return objs;
}

/** 로컬 디렉토리 → S3 `keyPrefix/`. md5 가 ETag 와 다르거나 원격에 없는 파일만. dryRun 이면 올릴 목록만 계산 */
export async function pushDir(localDir: string, keyPrefix: string, opts: { dryRun?: boolean } = {}): Promise<{ uploaded: string[]; unchanged: number; bytes: number }> {
  assertKey(keyPrefix);
  const remote = new Map((await storage().list(keyPrefix)).map((o) => [o.key, o.etag]));
  const uploaded: string[] = [];
  let unchanged = 0, bytes = 0;
  for (const rel of await walkFiles(localDir)) {
    const key = keyPrefix + rel;
    const body = await fs.readFile(path.join(localDir, rel));
    if (remote.get(key) === md5(body)) { unchanged++; continue; }
    if (!opts.dryRun) await storage().put(key, body, contentTypeOf(rel));
    uploaded.push(key); bytes += body.length;
  }
  if (uploaded.length && !opts.dryRun) log(`  ⇧ ${keyPrefix} ${uploaded.length} 파일 올림`);
  return { uploaded, unchanged, bytes };
}

/** 워커 단계용: WORK_ROOT/<prefix> ↔ S3 <prefix> */
export const pullPrefix = (prefix: string) => pullDir(prefix, path.join(cfg.workRoot, prefix));
export const pushPrefix = (prefix: string) => pushDir(path.join(cfg.workRoot, prefix), prefix);

/** 파일 하나 올리기 (스윕 아카이브 등 — 디렉토리 동기화가 필요 없는 산출물) */
export async function putFile(key: string, body: Buffer | string, contentType = contentTypeOf(key)) {
  await storage().put(assertKey(key), Buffer.isBuffer(body) ? body : Buffer.from(body, "utf-8"), contentType);
}

/** DB 키 → 로컬 캐시 경로. `s3:` 가 정규, `local:`·접두사 없음은 이관 전 기록(같은 상대 경로) */
export function localPathOf(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  const rel = key.replace(/^(s3|local):/, "");
  const p = path.resolve(cfg.workRoot, rel);
  if (!p.startsWith(path.resolve(cfg.workRoot) + path.sep)) throw new Error(`저장소 키가 WORK_ROOT 를 벗어난다: ${key}`);
  return p;
}
export const s3Key = (rel: string) => `s3:${assertKey(rel)}`;

export { exists };
