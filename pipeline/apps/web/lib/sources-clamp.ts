/**
 * 발행 payload 의 sources 를 제품 API 한도에 맞춘다 (2026-10-27 — 일괄 발행에서 2편이 "sources 값이 올바르지 않아요" 400:
 * 발행처 이름이 149자 — 서버 ContentSourceInputDto 는 title 255 · author 100 · url 2048). 제목 없는 항목은 뺀다. 자르는 것은 안전망이고,
 * 긴 발행처 이름은 기획·보강 단계에서 짧게 쓰는 것이 맞다.
 */
export const SOURCE_LIMITS = { title: 255, author: 100, url: 2048 } as const;

const clamp = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return `${sp > n * 0.6 ? cut.slice(0, sp) : cut}…`;
};

export function clampSources(list: { title?: string | null; publisher?: string | null; author?: string | null; url?: string | null }[] | null | undefined): { title: string; author?: string; url?: string }[] {
  return (list ?? [])
    .filter((s) => String(s.title ?? "").trim())
    .map((s) => {
      const author = clamp(String(s.author ?? s.publisher ?? ""), SOURCE_LIMITS.author);
      const url = String(s.url ?? "").trim();
      return { title: clamp(String(s.title), SOURCE_LIMITS.title), ...(author ? { author } : {}), ...(url && url.length <= SOURCE_LIMITS.url ? { url } : {}) };
    });
}
