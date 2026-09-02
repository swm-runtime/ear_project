import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * 파이프라인 S3 — 서버 전용 (spec/08 2장 · spec/10 3.3, M4).
 * 자격증명은 SDK 기본 체인: EC2 인스턴스 역할 `ear-ai-ec2`, 로컬 개발은 임대 보유자의 SSO 프로필(`AWS_PROFILE`). 액세스 키를 env 에 두지 않는다.
 * 키 범위는 버킷 정책·IAM 정책과 같은 episodes/·sweeps/·datasets/ 뿐 — 밖의 키는 거부한다.
 */
const ALLOWED = /^(episodes|sweeps|datasets)\//;

export function s3Configured(): boolean { return !!process.env.PIPELINE_BUCKET; }
const bucket = () => { const b = process.env.PIPELINE_BUCKET; if (!b) throw new Error("PIPELINE_BUCKET 미설정"); return b; };

let client: S3Client | null = null;
function s3(): S3Client {
  // WHEN_REQUIRED: 기본값은 PUT 마다 CRC 체크섬을 요구해 서명 URL 로 올리는 워커와 형태가 어긋난다
  return (client ??= new S3Client({ region: process.env.AWS_REGION || "ap-northeast-2", requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" }));
}

function check(v: unknown, what: string): string {
  if (typeof v !== "string" || !v || v.length > 1024) throw new Error(`${what} 형식 오류`);
  if (!ALLOWED.test(v) || v.includes("//") || v.split("/").includes("..")) throw new Error(`허용되지 않는 ${what}: ${v}`);
  return v;
}
export function assertKey(key: unknown): string { const k = check(key, "키"); if (k.endsWith("/")) throw new Error(`허용되지 않는 키: ${k}`); return k; }
export function assertPrefix(prefix: unknown): string { return check(prefix, "prefix"); }

export function contentTypeOf(key: string): string {
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  return ({ ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".jsonl": "application/x-ndjson" } as Record<string, string>)[ext] ?? "application/octet-stream";
}

/** 텍스트 객체 읽기 — 없으면 null, 그 외 오류는 던진다 */
export async function getText(key: string): Promise<string | null> {
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: assertKey(key) }));
    return await r.Body!.transformToString("utf-8");
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === "NoSuchKey") return null;
    throw e;
  }
}

/** 텍스트 객체 쓰기 — 버킷이 버저닝이라 이전 본이 남는다 (사람 수정의 되돌리기 근거) */
export async function putText(key: string, text: string, contentType = contentTypeOf(key)): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: assertKey(key), Body: text, ContentType: contentType }));
}

export interface StoredObject { key: string; etag: string; size: number; last_modified: string | null }
export async function listObjects(prefix: string, max = 1000): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  let token: string | undefined;
  do {
    const r = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: assertPrefix(prefix), ContinuationToken: token, MaxKeys: Math.min(1000, max - out.length) }));
    for (const o of r.Contents ?? []) if (o.Key) out.push({ key: o.Key, etag: (o.ETag ?? "").replace(/"/g, ""), size: o.Size ?? 0, last_modified: o.LastModified?.toISOString() ?? null });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token && out.length < max);
  return out;
}

/** 바이너리 객체 읽기 — 없으면 null. headOnly=true 면 존재 확인만(바이트를 받지 않는다) */
export async function getBytes(key: string, headOnly = false): Promise<Uint8Array | null> {
  try {
    if (headOnly) {
      await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: assertKey(key) }));
      return new Uint8Array(0);
    }
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: assertKey(key) }));
    return await r.Body!.transformToByteArray();
  } catch (e: unknown) {
    const name = (e as { name?: string })?.name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw e;
  }
}

/** 로컬 워커용 서명 URL — 워커는 이 URL 로 S3 와 직접 통신한다 (AWS 키 없이). 만료는 짧게 */
export function presignGet(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: assertKey(key) }), { expiresIn });
}
export function presignPut(key: string, contentType: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: assertKey(key), ContentType: contentType }), { expiresIn });
}
