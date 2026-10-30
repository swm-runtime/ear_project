/**
 * 간행물 (KAN-247 — PM 결정 2026-10-22, 구현 2026-10-26) — 시리즈의 **발행 이름**(서버 `series.publisher_name`: 앱 시리즈 화면 제목 아래 줄,
 * "○○의 다른 시리즈" 묶음의 기준)과 **썸네일 스타일**을 한 번에 정한다. 같은 간행물의 시리즈는 앱에서 서로 묶이고 같은 디자인으로 나간다.
 *
 * 목록은 코드 상수다(2026-10-26 박수헌 — 콘솔은 자유 입력이 아니라 여기서 고른다. 글자가 한 자라도 다르면 앱이 다른 간행물로 본다: "키워드" ≠ "키워드 시리즈").
 * 파이프라인은 `series.publication` 에 **키**를 저장하고, 서버에는 그 판의 `name` 을 보낸다. 없음(null) = 발행 이름 없음 · 일반 장면 썸네일.
 * 기본 셋은 여기 상수고, 그 뒤의 간행물은 콘솔 시리즈 화면 "새 간행물"이 `publications` 테이블(0036, 2026-10-27)에 더한다 — 이름 + 기존 디자인 셋 중 하나.
 * 워커·콘솔은 상수 + 테이블을 합친 목록(`mergePublications`)을 아래 함수의 `list` 인자로 넘긴다(브라우저 번들에도 들어가는 파일이라 DB 를 직접 읽지 않는다).
 * 이름은 주제가 아니라 형식을 가리키게 짓는다 — 다른 주제의 시리즈도 담을 수 있게.
 *
 * 스타일:
 *   keyword — 키워드 시리즈 디자인(워커 `thumbnail-series.ts`: 라벨 · 손글씨 큰 단어 · 박스 · 편 번호, 표지는 "전 N편"). 큰 단어(`series.thumb_word`)가 있어야 한다
 *   phrasebook — 회화집 디자인(워커 `thumbnail-phrasebook.ts`: 작은 책 표지에 그 편의 표현 로마자·한글·뜻, 책갈피 리본에 번호). 이미지 모델 없이 코드만 — 글자 칸은 머리글(`thumb_box`)·라벨만 쓴다
 *   tv      — TV 정지 화면(워커 `thumbnail-code.ts`): 편 제목(설계안)을 화면에, 채널 번호 = 편 번호. 2026-10-28 "광고로 읽는 마케팅"
 *   notes   — 포스트잇 벽(같은 파일): 제목·번호·시리즈명 메모지 세 장. 2026-10-28 "사례로 알아보는 창업"
 *   layers  — 계층 쌓기(같은 파일): 층 4개(series.thumb_layers "이름:시작-끝")를 쌓고 이번 편의 층만 밝게. 2026-10-29 "탑다운 백엔드"
 *   wave    — 파형 그래프(같은 파일): 오실로스코프 채널을 편마다 하나씩 쌓고 이번 편 채널만 밝게. 2026-10-29 "계층마다 보는 네트워크"
 *   scene   — 일반 편과 같은 장면 썸네일. 연대기(네 시대 세로 패널)는 워커 디자인이 아직 없어 scene 으로 둔다(기존 철학 시리즈 썸네일은 2026-10-22 손으로 합성한 것)
 */
/** locale.ts 의 PipelineLocale 과 같은 값 — 이 파일은 콘솔 브라우저 번들에도 들어가므로(`@ear/pipeline/publication`) node 전용 모듈을 import 하는 locale.ts 를 끌어오지 않는다 */
export type PublicationLocale = "ko" | "en";

export type PublicationStyle = "keyword" | "phrasebook" | "scene" | "tv" | "notes" | "layers" | "wave";
/** 콘솔 "새 간행물"이 고르는 디자인 — 워커에 있는 디자인만 */
export const PUBLICATION_STYLES: readonly { style: PublicationStyle; label: string; desc: string }[] = [
  { style: "keyword", label: "키워드 디자인", desc: "같은 바탕 그림에 라벨·손글씨 큰 단어·박스·편 번호 (CS 지식·경제 상식). 큰 단어가 필요하다" },
  { style: "scene", label: "장면 썸네일", desc: "일반 편과 같은 장면 썸네일 — 발행 이름만 붙는다 (연대기)" },
  { style: "phrasebook", label: "회화집 디자인", desc: "작은 책 표지에 그 편의 표현(로마자·한글)과 뜻 — 영어판 표현 시리즈용" },
  { style: "tv", label: "TV 정지 화면", desc: "어두운 바탕의 옛 TV 화면에 편 제목, 채널 번호 = 편 번호 (광고로 읽는 마케팅)" },
  { style: "notes", label: "포스트잇 벽", desc: "노랑(제목)·분홍(번호)·민트(시리즈명) 메모지 세 장 (사례로 알아보는 창업)" },
  { style: "layers", label: "계층 쌓기", desc: "시스템을 층으로 쌓고 이번 편의 층만 밝게 — 층 이름:편 범위를 시리즈 화면에 적는다 (탑다운 백엔드)" },
  { style: "wave", label: "파형 그래프", desc: "인디고 바탕의 오실로스코프 — 편마다 채널(파형) 하나, 이번 편 채널만 밝게 (계층마다 보는 네트워크)" },
];
/** 계층 쌓기(layers) 디자인의 층 — "연결:1-6, 처리:7-9, 데이터:10-18, 운영:19-26" 를 푼다. 틀리면 빈 배열 */
export interface ThumbLayer { name: string; from: number; to: number }
export function parseLayers(text: string | null | undefined): ThumbLayer[] {
  const out: ThumbLayer[] = [];
  for (const part of String(text ?? "").split(/[,\n]/)) {
    const m = part.trim().match(/^(.+?)\s*[:：]\s*(\d+)\s*[-~–]\s*(\d+)$/);
    if (!m) continue;
    const from = Number(m[2]), to = Number(m[3]);
    if (!m[1].trim() || from < 1 || to < from) continue;
    out.push({ name: m[1].trim(), from, to });
  }
  return out;
}
/** 층 입력 검증 — 사유를 돌려주면 막는다. 층은 2~6개, 이름 6자 이내, 범위가 겹치지 않고 1화부터 편수까지 빈틈 없이 이어져야 한다 */
export function layersBlocker(text: string, total: number | null): string | null {
  const ls = parseLayers(text);
  if (!text.trim()) return "층을 적어 달라 — 예: 연결:1-6, 처리:7-9, 데이터:10-18, 운영:19-26";
  if (!ls.length) return "층 형식이 아니다 — 이름:시작-끝 을 쉼표로 나눈다";
  if (ls.length < 2 || ls.length > 6) return "층은 2~6개";
  if (ls.some((l) => l.name.length > 6)) return "층 이름은 6자 이내";
  const sorted = [...ls].sort((a, b) => a.from - b.from);
  if (ls.some((l, i) => l !== sorted[i])) return "층은 편 번호 순서대로 적는다";
  for (let i = 1; i < sorted.length; i++) if (sorted[i].from !== sorted[i - 1].to + 1) return `${sorted[i - 1].name} 다음 층이 ${sorted[i - 1].to + 1}화에서 시작해야 한다`;
  if (sorted[0].from !== 1) return "첫 층은 1화에서 시작한다";
  if (total && sorted[sorted.length - 1].to !== total) return `마지막 층이 ${total}화에서 끝나야 한다`;
  return null;
}
export interface Publication {
  /** 저장 키 — 바꾸지 않는다 */
  key: string;
  locale: PublicationLocale;
  /** 서버 `publisher_name` 으로 보내는 글자 — 앱에 그대로 나간다 */
  name: string;
  style: PublicationStyle;
  /** 콘솔 선택지 설명 */
  hint: string;
}

export const PUBLICATIONS: readonly Publication[] = [
  { key: "keyword", locale: "ko", name: "키워드", style: "keyword", hint: "용어 하나씩 훑는 형식 — CS 지식 · 경제 상식" },
  { key: "chronicle", locale: "ko", name: "연대기", style: "scene", hint: "시대 순으로 흐름을 잡는 형식 — 서양·동양 철학 (전용 썸네일 디자인은 아직 없어 장면 썸네일)" },
  { key: "phrasebook", locale: "en", name: "Phrasebook", style: "phrasebook", hint: "Two or three related Korean expressions per episode — pocket phrasebook thumbnail (2026-10-26)" },
  { key: "adread", locale: "ko", name: "광고로 읽는", style: "tv", hint: "광고 한 편씩 뜯어보며 배우는 형식 — TV 정지 화면 썸네일 (2026-10-28)" },
  { key: "casebook", locale: "ko", name: "케이스", style: "notes", hint: "사례 하나씩 따라가는 형식 — 포스트잇 벽 썸네일 (2026-10-28)" },
  { key: "topdown", locale: "ko", name: "탑다운", style: "layers", hint: "전체 구조에서 한 층씩 내려가는 형식 — 계층 쌓기 썸네일 (2026-10-29)" },
  { key: "network", locale: "ko", name: "네트워크", style: "wave", hint: "계층·구간 하나씩 짚어 가는 형식 — 파형 그래프 썸네일 (2026-10-29, 계층마다 보는 네트워크)" },
];

/** 상수 + `publications` 테이블 행(콘솔에서 만든 간행물) — 키가 겹치면 상수가 이긴다 */
export function mergePublications(rows: readonly Publication[] | null | undefined): Publication[] {
  const out = [...PUBLICATIONS];
  for (const r of rows ?? []) if (!out.some((p) => p.key === r.key)) out.push({ key: r.key, locale: r.locale, name: r.name, style: r.style, hint: r.hint ?? "" });
  return out;
}
/** 이 판(인스턴스)에서 고를 수 있는 간행물 */
export function publicationsFor(locale: PublicationLocale, list: readonly Publication[] = PUBLICATIONS): Publication[] {
  return list.filter((p) => p.locale === locale);
}
/** 키 → 간행물. 없음·모르는 키는 null */
export function publicationOf(key: string | null | undefined, list: readonly Publication[] = PUBLICATIONS): Publication | null {
  if (!key) return null;
  return list.find((p) => p.key === key) ?? null;
}
/** 썸네일 스타일 — 간행물이 없거나 모르는 키면 장면 썸네일 */
export function publicationStyle(key: string | null | undefined, list: readonly Publication[] = PUBLICATIONS): PublicationStyle {
  return publicationOf(key, list)?.style ?? "scene";
}
/** 서버가 돌려준 발행 이름 → 간행물(제품 시리즈 표가 현재 값을 선택지에 맞출 때). 목록에 없는 이름은 null */
export function publicationByName(name: string | null | undefined, locale?: PublicationLocale, list: readonly Publication[] = PUBLICATIONS): Publication | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  return list.find((p) => p.name === n && (!locale || p.locale === locale)) ?? null;
}
/** 새 간행물 입력 검증 — 이름은 2~24자, 같은 판에 같은 이름(공백 무시)이 없어야 한다. 사유를 돌려주면 막는다 */
export function newPublicationBlocker(v: { name: string; style: string }, locale: PublicationLocale, list: readonly Publication[]): string | null {
  const name = v.name.trim();
  if (name.length < 2 || name.length > 24) return "간행물 이름은 2~24자다 — 앱 시리즈 화면 제목 아래에 그대로 나간다";
  if (!PUBLICATION_STYLES.some((s) => s.style === v.style)) return `모르는 디자인: ${v.style}`;
  const dup = list.find((p) => p.locale === locale && p.name.replace(/\s+/g, "") === name.replace(/\s+/g, ""));
  if (dup) return `같은 이름의 간행물이 이미 있다 (${dup.name})`;
  return null;
}
