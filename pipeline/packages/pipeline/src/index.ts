/**
 * @ear/pipeline — 단계별 프롬프트 조립기 + 결과 스키마.
 *
 * 프롬프트 자산(skills/)은 여기서 내용을 읽어 넣지 않는다 — 실행기(Claude)가 Read 하도록
 * **경로만** 넘긴다 (컨텍스트 예산 원칙: 생성 반입 = guidelines + 골드 + spec/04 + 소스만, spec/09).
 * 2026-08-29 사이클 4에서 서브에이전트에 넘긴 프롬프트를 그대로 코드화한 것이다.
 */

export type MidTopic = string;

export interface SourceRef {
  url: string;
  title: string;
  publisher: string;
  published?: string | null;
  backbone?: boolean;
  /** 군집화 v2 역할 (근거 앵커·사례·반론·한계·수치·조사·역사·맥락) — v1 후보는 없음 */
  roles?: string[];
  tier?: string;
}

export interface BacklogCandidate {
  id: string;
  mid_topic: MidTopic;
  title: string;
  target_fit: string | null;
  angle: string | null;
  sources: SourceRef[];
  /** 군집화 v2 (0016): 축·유형·빈 역할. v1 후보는 null/빈 배열 */
  axis?: string | null;
  axis_type?: string | null;
  gaps?: string[];
}

/** 설계 프롬프트에 넣는 백로그 축·역할표 블록 — v2 후보면 구성안의 출발점, v1 후보면 angle 을 참고로만 */
export function candidateAxisBlock(c: BacklogCandidate): string {
  if (!c.axis) return `- 백로그의 구성 각도(참고만, 따르지 말 것): ${c.angle ?? "(미기재)"}`;
  const roles = c.sources.map((s, n) => `S${n + 1} ${s.publisher}: ${(s.roles ?? []).join("·") || "역할 미정"}`).join(" / ");
  return `- **백로그의 축 (군집화 v2 — 구성안의 출발점)**: [${c.axis_type}] ${c.axis}
- 백로그의 역할표: ${roles}${c.gaps?.length ? `
- 비어 있는 역할: ${c.gaps.join("·")} — 원문을 읽고 채울 수 있으면 채우고, 못 채우면 구성안 역할표에 "없음"으로 명시한다` : ""}
- 원문을 정독한 뒤 이 축이 성립하지 않으면 바꿔도 된다 — 단 완료 보고 notes 에 "축 변경: 이유"를 적는다. 유형(대립·역설·재정의) 규칙은 그대로다.`;
}

/**
 * 프롬프트 자산·산출물 경로.
 * - assetRoot: 읽기 전용 프롬프트 자산 — 레포 `docs/ai` (skills/·spec/ 레이아웃이 그대로 맞는다)
 * - workRoot: 산출물 작업 디렉토리 — `episodes/`·`sources/sweeps/` (레포 밖. S3 이관 전 local: 키의 기준)
 * 둘을 나누는 이유: 실행기(`claude -p`)의 cwd 는 workRoot 다 — cwd 가 레포 안이면 Claude Code 가 루트 CLAUDE.md·.claude/ 를
 * 자동 반입해 생성 컨텍스트를 오염시킨다 (spec/09 컨텍스트 예산). 자산은 --add-dir 로만 연다.
 */
export function assetPaths(assetRoot: string, workRoot: string = assetRoot) {
  const p = (...s: string[]) => [assetRoot, ...s].join("/");
  return {
    guidelines: p("skills", "draft", "guidelines.md"),
    goldShort: p("skills", "draft", "examples", "gold-T260820-001-short.md"),
    goldFullEum: p("skills", "draft", "examples", "gold-T260820-002-full.md"),
    goldFullYuna: p("skills", "draft", "examples", "gold-T260828-001-full.md"),
    specScript: p("spec", "04-script.md"),
    specQa: p("spec", "05-qa.md"),
    specBacklog: p("spec", "03-backlog.md"),
    qaPrompt: p("skills", "qa", "prompt.md"),
    criticRubric: p("skills", "critic", "rubric.md"),
    criticRubricV2: p("skills", "critic", "rubric-v2.md"),
    episodeDir: (id: string) => [workRoot, "episodes", id].join("/"),
  };
}

/** 해설 담당: topics.explainer 가 있으면 그것, 없으면 중분류 관할 규칙 (spec/04) */
export function explainerFor(midTopic: MidTopic): "윤아" | "이음" {
  // 2026-09-06 체계 개편: 심리·마음·인문·교양 대분류의 중분류 = 윤아, 나머지(돈·경제·비즈니스·과학·기술·자격증) = 이음. 구 이름(인문·교양·글쓰기)도 남긴다.
  return ["심리학", "뇌과학·인지", "습관·동기", "인간관계", "철학", "역사", "사회·문화", "예술", "한능검", "인문·교양", "글쓰기"].includes(midTopic) ? "윤아" : "이음";
}

/** 도입 형태 로테이션 — 에피소드 간 도입 템플릿화 방지 (사이클 4 판정) */
/** v5.1 (2026-09-01): 구 힌트는 "주제로 스며든다"였다 — 구 규칙 13. 이제 주제는 인트로가 이미 선언했으므로,
 *  네 형태는 모두 "인트로의 질문을 받아 청취자가 대화에 앉는 두세 턴"의 변주다. 주제를 다시 발견하는 척하지 않는다. */
export const INTRO_STYLES = [
  { key: "experience", label: "일상 경험담형", hint: "인트로 질문을 상대가 자기 일상의 사소한 사례 하나로 받는다(소스와 무관한 프레임). 그 사례를 두세 턴 주고받다 첫 해설로." },
  { key: "object", label: "사물 묘사형", hint: "인트로 질문을 구체적 물건 하나로 받는다 — 그 물건이 지금 어떻게 생겼는지 두세 턴, 그 물건이 주제의 첫 사례가 된다." },
  { key: "question", label: "궁금증 질문형", hint: "인트로 질문에 상대가 되묻는다 — 왜 그게 궁금했는지(기원 서사) 한 조각을 캐묻고, 그 답이 첫 해설의 입구가 된다." },
  { key: "thesis", label: "화두 선언형", hint: "주제 선언 직후 해설 담당이 '결론부터 말하면 흔히 아는 것과 반대다' 식 뜻밖의 한 줄을 던지고, 진행 담당이 반발·되물음으로 두세 턴 앉는다." },
] as const;

export function pickIntroStyle(seed: number) {
  return INTRO_STYLES[Math.abs(seed) % INTRO_STYLES.length];
}

const COMMON_RULES = `   - 핵심 규칙 리마인드: 소스가 말한 것까지만 (비교 축 추가·연관의 방향 확정·귀속 범위 확장·연대 환산·문장 위치 주장 금지 — QA 최다 실패 유형), 복창 대신 번역, 질문에 기원 서사, 티키타카·호흡 교차 (**후반부까지** 유지 — 후반 리듬 균질화가 4편 연속 지적됨), 역질문 1~2회, '요'체·'다'체 혼용, 귀속 전언체, 비유는 새 이해를 줄 때만 + 에피소드 내 비유 계열 통일, AI체·번역투 금지 (소리 내 읽어 어색하면 다시), 날짜는 년-월까지, 소수점·정밀 수치는 자연스러운 범위 표현 (단 실제보다 크게 올림 금지), 가독 표기 (음차 금지 — 영문 고유명사·두문자는 원표기), 오디오 태그는 [curious] [surprised] [sighs] [exhales] [laughs] [whispers] [excited]만 턴당 최대 1개 수준. 소스 게재 매체를 언급할 때 "같은 매체" 같은 지시어는 직전 명명 매체로 해소되므로 매체가 바뀌면 반드시 재명명.`;

/** spec 문서에서 `## n.` 장만 골라 잇는다 (2026-09-09 프롬프트 슬림화): 대본·설계 프롬프트는 spec/04 의 규격 장(3~6)만 반입하고 절차·산출물·숏폼·완료 조건은 넣지 않는다 — 규칙 33K자 중 5K 절감, 모델이 볼 이유가 없는 장이다 */
export function specSections(md: string, nums: number[]): string {
  const parts = md.split(/^(?=## \d+\. )/m);
  return parts.filter((p) => { const m = p.match(/^## (\d+)\. /); return m && nums.includes(Number(m[1])); }).map((p) => p.trim()).join("\n\n");
}

const GOLD_USAGE = `   **골드 사용법 (중요)**: 골드에서 배울 것은 구조·리듬·기법·전언체뿐이다. 골드의 **구체 비유(요리 재료·마트 진열대·사진 현상 등), 특정 문구(확인구 "예리하세요"·"정확해요"·"딱 그 그림이에요", 역질문 답변 "솔직히 반반이에요", 피벗 "오늘 이야기가 정확히 그 얘기예요" 등), 도입 형태는 재사용 금지** — 같은 기법을 새 재료로 구현하라.`;

export interface Templates {
  version: string;
  intro: string;
  closing: string;
  /** 클로징 인사 (tpl-v2, 2026-09-09 박수헌): 해설 담당 정리 뒤 진행 담당이 말하는 **마지막 턴**. 한 줄에 골격 하나 — 여러 줄이면 에피소드마다 돌아가며 쓴다. 비우면 tpl-v1 형태(정리로 끝) */
  closing_signoff?: string;
  major_lines: Record<string, string>;
}

export interface DraftInput {
  assetRoot: string;
  workRoot: string;
  episodeId: string;
  candidate: BacklogCandidate;
  introStyle: (typeof INTRO_STYLES)[number];
  promptVersion: string;
  templates?: Templates | null;
  /** 클로징 인사 골격 선택 시드 (에피소드 수) — 여러 골격이면 돌아가며 */
  signoffSeed?: number;
  majorTopic?: string;
}

/** 시그니처 인트로·마무리 (미결 #7 확정, 2026-08-31 박수헌). 골격은 고정, {슬롯}만 에피소드별로 채운다. */
/** 클로징 인사 골격 목록 — 템플릿 문자열의 비어 있지 않은 줄 하나가 골격 하나 */
export function signoffVariants(t: Templates | null | undefined): string[] {
  return (t?.closing_signoff ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
/** 에피소드마다 돌아가며 고른다 (seed = 에피소드 수, 도입 방식과 같은 방식) */
export function pickSignoff(t: Templates | null | undefined, seed: number): string | null {
  const v = signoffVariants(t);
  return v.length ? v[Math.abs(seed) % v.length] : null;
}

function templateBlock(i: DraftInput): string {
  const t = i.templates;
  if (!t) return "   - 인트로·클로징 템플릿 미확정 — `{인트로 템플릿}` / `{클로징 템플릿}` 자리 표기만 남긴다.";
  const majorLine = (i.majorTopic && t.major_lines?.[i.majorTopic]) || "";
  return `   - **인트로 (고정 시그니처 — 골격을 바꾸지 말 것, {슬롯}만 채운다)**:
\`\`\`
${t.intro}
\`\`\`
     · {대주제 한 줄} = ${majorLine ? `"${majorLine}" (확정 문구 — 토씨 그대로 사용)` : `대분류 "${i.majorTopic ?? "-"}"를 소개하는 한 줄을 **직접 지어 쓴다** (확정 문구 미정 상태). 청취자는 자기계발을 원하는 2030 직장인이다 — 개발자·전문가 대상 표현 금지. 한 문장, 담백하게 (예: "출근길에 채우는 배움 한 조각 전하러 왔습니다.")`}
     · {주제 한 줄 요약} = 이 에피소드의 축을 한 줄로 (제목 복창이 아니라 귀로 들어도 잡히는 말로)
     · 인트로는 **진행 담당(Y1)** 의 발화다. 마지막 줄의 질문까지 한 턴으로 이어 쓴다.
   - **마무리 (고정 시그니처 — 골격 고정)**:
\`\`\`
${t.closing}
\`\`\`
     · 진행 담당이 위 두 문장(지금까지~ + 한마디/정리 요청)을 말하고, **해설 담당이 이어서 내용을 정리**한다 — 정리는 "무엇을 이해하게 됐나"로 닫는다 (규칙 13-1).
     · 진행자의 "한마디"는 매번 새로 쓴다 (예시 문구를 복제하지 말 것).${pickSignoff(t, i.signoffSeed ?? 0) ? `
   - **클로징 인사 (고정 시그니처 — 대본의 마지막 턴, 진행 담당. 이 에피소드에 지정된 골격)**:
\`\`\`
${pickSignoff(t, i.signoffSeed ?? 0)}
\`\`\`
     · 해설 담당의 정리 턴 **다음에** 진행 담당이 이 골격으로 한 턴 더 말하고 대본이 끝난다 — 마지막 턴은 반드시 진행(Y) 턴이다. {슬롯}만 채우고 골격은 바꾸지 않는다. 골드 예시에는 이 턴이 없다(tpl-v1 시절) — 템플릿이 우선한다.` : ""}`;
}

export function buildDraftPrompt(i: DraftInput): string {
  const a = assetPaths(i.assetRoot, i.workRoot);
  const explainer = explainerFor(i.candidate.mid_topic);
  const host = explainer === "윤아" ? "이음" : "윤아";
  const sources = i.candidate.sources
    .map((s, n) => `${n + 1}. ${s.publisher}, "${s.title}"${s.backbone ? " (뼈대 후보)" : ""} — ${s.url}${s.published ? ` (${String(s.published).slice(0, 7)})` : ""}`)
    .join("\n");
  const dir = a.episodeDir(i.episodeId);
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 대본 작가다. 청취자는 자기계발을 원하는 2030 한국 직장인 (IT 개발자 아님). 15분 분량의 2인 대화 팟캐스트 에피소드 대본을 만든다.

## 0. 먼저 읽을 파일 (이것 외의 프로젝트 파일은 읽지 말 것 — 특히 episodes/ 하위 다른 에피소드, critic/qa 리포트, PIPELINE 문서 금지)
1. ${a.guidelines} — 대본 규칙 (${i.promptVersion}). 전 규칙 준수.
2. ${a.specScript} — 대본 규격·페르소나.
3. 골드 예시 3종: ${a.goldShort}, ${a.goldFullEum}, ${a.goldFullYuna}
${GOLD_USAGE}

## 1. 에피소드 정보 (백로그 ${i.candidate.id}, 게이트1 승인 완료)
- 에피소드 ID: ${i.episodeId} · 제목(가): "${i.candidate.title}" · 중분류: ${i.candidate.mid_topic}
- 해설: **${explainer}** / 진행: **${host}** — 역할 고정, spec/04 페르소나 준수
- 축(규칙 13-1): ${i.candidate.angle ?? "(백로그 angle 미기재 — 제목의 개념·질문을 축으로)"} 사건이 아니라 개념이 에피소드를 이끈다. 마무리는 "무엇을 이해하게 됐나"로.
- 타깃 정합 메모: ${i.candidate.target_fit ?? "-"}

## 2. 소스 (전부 WebFetch로 원문 정독 — 이 단계가 파이프라인에서 원문을 읽는 유일한 지점)
${sources}

403·접근 실패 시 우회 금지 — 해당 소스 제외하고 진행 (최소 3건 유지, 미달 시 중단·보고). 영어 소스이면 대본은 전량 한국어 재서술. 직접 인용은 짧게 + 번역 + 귀속.

## 3. 산출물 (디렉토리 ${dir}/ 에 생성 — 이 디렉토리 밖에는 아무것도 쓰지 말 것)
a) **sources.md** — 첫 줄에 "> 내부 증적 — 재배포 금지" 표기. 소스별로: 메타(발행처·제목·URL·발행일) + **원문 발췌(원문 언어 그대로, 항목 ID 부여)** + 한국어 요지. 발췌는 대본에 쓸 사실을 전부 커버해야 한다 — QA는 대본 원문이 아니라 이 발췌만을 기준으로 검증한다. 발췌에 없는 주장이 대본에 있으면 QA 실패다.
b) **claims.md** — 대본의 사실 주장 → 소스·발췌 ID 대조표.
c) **pronunciations.json** — 대본에 등장하는 **모든 비한글 표기**(영문 용어·인명·기관·매체 등) → 자연스러운 한국식 한글 발음. \`{"표기": "발음"}\` JSON 객체 하나만 (예: \`{"Stanford": "스탠퍼드", "AI": "에이아이"}\`). 인명은 원어 발음 기준. TTS 변환이 이 맵으로 치환한다 — 누락된 표기는 합성이 중단된다. 비한글 표기가 없으면 빈 객체 \`{}\`.
d) **script.md** — 대본. 규격:
   - 첫 줄 메타: 에피소드 ID·제목·중분류·해설/진행·프롬프트 버전(${i.promptVersion})·사용 소스 수.
   - 구조: 인트로 → 도입 → 본문 (해설 턴 E1, E2, ... / 진행 턴 Y1, Y2, ... 표기) → 마무리. **콜드오픈 구역은 두지 않는다** (2026-09-07 폐지 — [콜드오픈] 헤더가 있으면 L0 형식 위반으로 재생성된다)
   - **발화 줄 형식 (TTS 파서 계약 — 정확히 지킬 것)**: 번호 턴은 \`[윤아] E1 · 문장\` / \`[이음] Y1 · 문장\` — 화자 라벨이 먼저, 번호 뒤 구분자는 **가운뎃점(·)**. \`Y1.\`(마침표)·\`E1 [윤아]\`(번호 선행) 같은 변형 금지 — 파싱이 실패해 합성이 중단된다.
${templateBlock(i)}
   - 도입 (규칙 13, v5.1 개정 — **주제를 먼저 소개하고 시작한다**. 에둘러 들어가지 말 것): 주제 선언 뒤 첫 해설 턴 사이에 짧은 진입 구간(두세 턴)을 둔다. 주제는 인트로가 이미 말했으므로 **다시 발견하는 척("그 질문이 오늘 주제랑 닿아 있어요" 류) 금지**. 그 진입 방식 (이 에피소드 전용 지정): **${i.introStyle.label}** — ${i.introStyle.hint} 골드의 [도입]은 구 규칙 판이라 자리표기로 비워 두었다 — 형태를 참조할 것이 없으니 규칙 13 문장대로 쓴다. 인트로 골격은 고정이지만 질문의 재료는 매번 새로.
   - 분량: **공백·기호 제외 4,500자 이상 목표, 5,000자 내외 이상적** (350자/분 기준 약 13~15분). 채우기용 잡담·같은 말 반복 금지.
${COMMON_RULES}

## 4. 마무리 자기 점검 (필수)
대본 작성 후 claims를 발췌와 대조해 발췌에 없는 주장을 찾아 수정하라. 구역 헤더가 [인트로]·[도입]·[본문]·[마무리] 4개뿐인지 확인하라. 공백·기호 제외 글자 수([가-힣A-Za-z0-9]만 카운트, 템플릿 자리 제외)를 python으로 계산하라.

## 5. 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다.`;
}

export const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["turns", "chars", "minutes", "sources_used", "sources_excluded", "self_check_fixes", "notes"],
  properties: {
    turns: { type: "integer", description: "본편 발화 턴 수 (템플릿 제외)" },
    chars: { type: "integer", description: "공백·기호 제외 글자 수" },
    minutes: { type: "number", description: "350자/분 환산 분량" },
    sources_used: { type: "array", items: { type: "string" }, description: "사용한 소스 URL" },
    sources_excluded: { type: "array", items: { type: "object", additionalProperties: false, required: ["url", "reason"], properties: { url: { type: "string" }, reason: { type: "string" } } } },
    self_check_fixes: { type: "array", items: { type: "string" }, description: "자기 점검에서 발견·수정한 발췌 밖 주장" },
    notes: { type: "string", description: "특이사항 (역질문 위치, 비유 계열 등) 3문장 이내" },
  },
} as const;

export interface DraftRevisionInput extends DraftInput {
  attempt: number;
  qaFailures: { location: string; item: string; reason: string }[];
}

/** QA 실패 후 재생성 — 전면 재작성이 아니라 지적 사항만 최소 수정 (사이클 3·4의 수작업 절차를 코드화) */
export function buildDraftRevisionPrompt(i: DraftRevisionInput): string {
  const a = assetPaths(i.assetRoot, i.workRoot);
  const dir = a.episodeDir(i.episodeId);
  const failures = i.qaFailures.map((f, n) => `${n + 1}. [${f.location}] 항목 ${f.item}: ${f.reason}`).join("\n");
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 대본 작가다. QA(사실 무결성 검증)가 실패한 대본을 **최소 수정**한다 (attempt ${i.attempt}/3).

## 읽을 파일 (이 외 금지)
- ${dir}/script.md (수정 대상) · ${dir}/claims.md · ${dir}/sources.md (발췌 = 검증의 최종 기준)
- ${dir}/outline.md · ${dir}/script-notes.md — 있으면(2단계 초안) 구간 계약과 연결·비유 기록. 구간 구조는 유지한다
- ${a.guidelines} (규칙 참조용)

## QA 실패 사항 (전부 해소해야 한다)
${failures}

## 수정 원칙
- 지적된 턴만 고친다. 전면 재작성 금지 — 나머지 문장은 그대로 둔다.
- **통계 용어를 대본에 쓰지 않는다** (guidelines 규칙 24, L0 가 잡는다): QA 지적문에 "통계적으로 유의하지 않다"·"매개"·"정적 관계" 같은 말이 있어도 대본에는 말로 옮긴다 — "차이가 뚜렷하지 않았다", "A 가 B 를 거쳐 C 로 이어졌다", "같이 움직였다". (T260909-009: QA 가 요구한 단서를 "통계적으로 유의하지 않았다"로 넣어 L0 에 다시 걸렸다)
- 수정은 발췌 안으로 들어오는 방향으로만: 발췌에 없는 수식·비교·방향·연대·위치 주장은 삭제하거나 발췌 문장 범위로 축소한다. 발췌를 새로 추가하지 않는다 (원문 재접근 금지).
- 헤지·귀속 주체·세부(성별·관계·순서·위치·수량)는 발췌 수준으로 낮춘다 — 단정으로 올리거나 원저자 발언으로 바꾸거나 더 구체적으로 쓰지 않는다.
- 지시어 참조를 깨뜨리지 않는다: 삭제한 표현을 되받는 진행(Y) 턴·콜백("아까 그 ~", "같은 매체")이 있으면 함께 고친다. 매체 지시가 바뀌면 재명명한다.
- 수정 후 claims.md 해당 행을 갱신하고, 파일 끝에 "## QA attempt ${i.attempt - 1} 반영" 절로 수정 내역을 기록한다.
- 수정으로 새 비한글 표기(영문 용어·인명 등)를 도입했으면 ${dir}/pronunciations.json 에 한글 발음을 추가한다 (없는 표기는 TTS 합성이 중단된다).
- 같은 인용·문장을 다른 턴에서 이미 쓰고 있지 않은지 확인한다 (중복 낭독 금지).

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다.`;
}

export const DRAFT_REVISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fixes", "notes"],
  properties: {
    fixes: { type: "array", items: { type: "object", additionalProperties: false, required: ["location", "before", "after"], properties: { location: { type: "string" }, before: { type: "string" }, after: { type: "string" } } } },
    notes: { type: "string" },
  },
} as const;

export interface QaInput {
  assetRoot: string;
  workRoot: string;
  episodeId: string;
  attempt: number;
  scriptFile?: string;
}

/** 항목 6 정의 명시 — spec/05 6번 "영문 표기" 구 문구와 표기 이원화의 충돌 조정 (2026-08-29, spec 정정 승인 대기) */
const QA_ITEM6_NOTE = `## 항목 6 판정 기준 명시 (규격 충돌 조정 — 오케스트레이션 전달 사항)
spec/05 3장 6번의 "영문 표기" 문구는 표기 이원화 설계(spec/04 5장: 대본은 가독 표기로 영문 원표기 유지, 음차는 TTS 단계 치환 테이블 전담)와 충돌하는 구 문구로 확인되어 정정 제안 중이다. 항목 6은 **표·URL·시점 고정 표현·낭독 불가능한 숫자 표기·대본 내 음차 표기 혼입**을 검사하라 — 대본의 영문 원표기(고유명사·두문자·매체명·제목 등)는 위반이 아니다.`;

export function buildQaPrompt(i: QaInput): string {
  const a = assetPaths(i.assetRoot, i.workRoot);
  const dir = a.episodeDir(i.episodeId);
  const script = i.scriptFile ?? `${dir}/script.md`;
  const prior = i.attempt > 1 ? ` 이전 QA 회차의 판정도 반입하지 않는다 (이번이 attempt ${i.attempt}라는 사실만 안다). qa-report.md의 기존 내용도 읽지 말 것 — 추기만 한다. claims.md의 "QA 반영" 절도 판정 근거로 삼지 말 것 — 발췌만이 기준이다.` : "";
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 QA 검수자다. 대본의 사실 무결성을 독립 검증한다. 생성 맥락은 일절 모른 채 검사하는 것이 원칙이다.${prior}

## 입력 (이 파일들만 읽는다 — 다른 프로젝트 파일 금지. 소스 원문 URL 접속 금지: 검증 기준은 발췌가 최종이다)
1. ${a.qaPrompt} — QA 절차·항목 정의. 이 문서의 검사 항목과 판정 규약을 그대로 따른다.
2. ${a.specQa} — QA 명세.
3. ${script} — 검사 대상 대본.
4. ${dir}/claims.md — 주장 대조표.
5. ${dir}/sources.md — 소스 발췌 (검증의 최종 기준).

${QA_ITEM6_NOTE}

## 작업
전 검사 항목을 수행하고, 결과를 ${dir}/qa-report.md 파일 **끝에** "## attempt ${i.attempt} (${todayKst()})" 섹션으로 추가한다 (파일이 없으면 헤더 "# QA 리포트 — ${i.episodeId}" + "> QA: 독립 실행 (qa-v1.2) · 입력 3종 + spec/05만" 부터 새로 작성. 기존 내용 수정 금지, 추기만).
리포트에 포함: 항목별 판정 표, 실패 건마다 위치(턴 번호)·항목 번호·구체 사유(발췌의 어느 부분과 어긋나는지 또는 발췌에 없는지), 종합 판정.

특히 주의 깊게 볼 유형: ① 발췌에 없는 주장 (비교 축 추가, 연관의 방향 확정, 귀속 범위 확장, 연대·수치의 무근거 환산, 문장 위치 주장), ② 귀속 정확성 — 게재 매체 지시("~라는 매체", "같은 매체", "아까 그 ~")가 발췌의 실제 게재처와 일치하는지 지시 사슬 전수 추적, ③ 수치·시점의 상향 왜곡 (하향 범위 표현은 의도된 규격), ④ 구역이 [인트로]·[도입]·[본문]·[마무리] 4개인가 ([콜드오픈] 구역이 있으면 위반 — 2026-09-07 폐지), ⑤ 화자 규칙 (진행 담당의 사실 주장 금지 — 감상·추측 허용), ⑥ 수정 잔존 참조 (지시어·콜백이 가리키는 대상이 현재 대본 안에 실재하는지), ⑦ claims가 스스로 "발췌 밖" 등으로 표시한 항목은 그 판단을 믿지 말고 발췌 기준으로 독립 재판정.

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. 리포트 파일 작성이 먼저다.`;
}

export const QA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "failures", "holds", "report_written", "summary"],
  properties: {
    verdict: { type: "string", enum: ["qa_passed", "failed"] },
    failures: { type: "array", items: { type: "object", additionalProperties: false, required: ["location", "item", "reason"], properties: { location: { type: "string", description: "턴 번호 + 첫 몇 단어" }, item: { type: "string", description: "spec/05 항목 번호" }, reason: { type: "string" } } } },
    holds: { type: "array", items: { type: "string" }, description: "규약상 보류 항목 (5·7 등)" },
    report_written: { type: "boolean" },
    summary: { type: "string" },
  },
} as const;

export interface CriticInput {
  assetRoot: string;
  workRoot: string;
  episodeId: string;
  title: string;
  midTopic: MidTopic;
  scriptFile?: string;
  /** 루브릭 버전 — v2 = skills/critic/rubric-v2.md (초안, 100점 배점). 기본 v1 */
  rubric?: "v1" | "v2";
  /** tpl-v1 이전 세대 대본 (인트로·마무리가 자리표기) — v2 채점 시 3.5·3.7·G1에서 자리표기를 감점하지 않는다 */
  preTemplate?: boolean;
}

export function buildCriticPrompt(i: CriticInput): string {
  if (i.rubric === "v2") return buildCriticPromptV2(i);
  const a = assetPaths(i.assetRoot, i.workRoot);
  const dir = a.episodeDir(i.episodeId);
  const script = i.scriptFile ?? `${dir}/script.md`;
  const explainer = explainerFor(i.midTopic);
  const host = explainer === "윤아" ? "이음" : "윤아";
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 대본 비평가다. 스타일·구성 품질을 독립 평가한다. 생성 맥락·QA 결과는 일절 모른 채 평가하는 것이 원칙이다.

## 입력 (정확히 이 파일들만 읽는다 — 다른 프로젝트 파일 금지. 특히 같은 디렉토리의 qa-report, claims, sources 및 다른 에피소드 금지)
1. ${a.criticRubric} — 비평 루브릭. 이 문서의 평가 항목·리포트 규격을 그대로 따른다.
2. ${a.guidelines} — 대본 규칙 (평가 기준의 원본).
3. ${script} — 평가 대상 대본 (에피소드: "${i.title}", 해설 ${explainer} / 진행 ${host}, ${i.midTopic}).
4. 골드 예시 2종 (비교 기준): ${a.goldFullEum}, ${a.goldFullYuna}

## 작업
루브릭의 전 항목(A·B·C·D·F군 + E 종합)을 평가하고, 결과를 ${dir}/critic-report.md 에 작성한다. 리포트 규격은 루브릭 문서의 규격을 따른다 — 반드시 포함: 종합 점수(5축), 플래그 표(위치·항목·지적 + 빈 "판정(사람)"·"사유" 열), ⭐ 잘된 지점 표(빈 판정 열 포함), 사람 추가 지적란(빈 칸), 비평가 총평.

평가 시 특별 유의 (루브릭 항목 내에서):
- C5 (사건 종속): 에피소드가 주제 축으로 전개되는지.
- F5 확장 관점: 골드 예시의 구체 비유·문구·도입 형태를 복제했는지 — 골드 2종과 대조해 표면 요소 중복이 있으면 플래그.
- 도입부가 템플릿화된 형태("습관 질문 → 오늘은 그 얘기")인지, 자기만의 진입인지.
- "~라..." 식 리액션 개시 틱의 반복 여부 (진행 턴 전반).
- 후반부 리듬 균질화 (중간 해설→한 줄 리액션 반복 구간).

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. 리포트 파일 작성이 먼저다.`;
}

/** critic-v2 (초안): 판단 항목 20개 플래그 + 12항목 100점 채점. 리포트는 critic-report-v2.md — v1 리포트 스냅샷은 건드리지 않는다. */
function buildCriticPromptV2(i: CriticInput): string {
  const a = assetPaths(i.assetRoot, i.workRoot);
  const dir = a.episodeDir(i.episodeId);
  const script = i.scriptFile ?? `${dir}/script.md`;
  const explainer = explainerFor(i.midTopic);
  const host = explainer === "윤아" ? "이음" : "윤아";
  const pre = i.preTemplate
    ? `
## 이 대본은 tpl-v1 이전 세대다
인트로·마무리에 \`{인트로 시그니처 …}\` \`{클로징 …}\` 같은 자리표기가 있다. 생성 당시 템플릿이 없었던 것이지 대본 결함이 아니다.
- 3.5 오프닝·3.7 마무리: 자리표기를 **tpl-v1 골격이 있는 것으로 간주**하고 도입 구간·정리 내용만 채점한다. 자리표기 자체를 감점하지 않는다.
- C2: 주제 선언은 자리표기 안에 있는 것으로 간주한다.
- G1: 템플릿 골격 복제 판단에서 제외한다 (골드 관용구 복제는 그대로 본다).
`
    : "";
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 대본 비평가다. 스타일·구성 품질을 독립 평가한다. 생성 맥락·QA 결과·기계 검사(L0) 결과는 일절 모른 채 평가하는 것이 원칙이다.

## 입력 (정확히 이 파일들만 읽는다 — 다른 프로젝트 파일 금지. 특히 같은 디렉토리의 qa-report, claims, sources, critic-report.md(구판) 및 다른 에피소드 금지)
1. ${a.criticRubricV2} — 비평 루브릭 v2. 이 문서의 판단 항목(2.1)·배점과 구간 정의(3장)·리포트 규격(4장)을 그대로 따른다.
2. ${a.guidelines} — 대본 규칙 (평가 기준의 원본).
3. ${script} — 평가 대상 대본 (에피소드: "${i.title}", 해설 ${explainer} / 진행 ${host}, ${i.midTopic}).
4. 골드 예시 2종 (비교 기준선): ${a.goldFullEum}, ${a.goldFullYuna}
${pre}
## 작업
결과를 ${dir}/critic-report-v2.md 에 작성한다 (루브릭 v2 4장 규격). 순서:
1. **점수 (100점)** — 3장의 하위 항목 12개를 **각각 독립적으로** 채점한다. 항목마다 구간 정의를 대본과 대조하고, 점수 옆에 반드시 대본 자구를 \`[E12] "…"\` 형식으로 인용한다 (인용 없는 점수는 무효). 합계는 계산 결과일 뿐 — 합계를 보고 조정하지 않는다. 몰입(3.10)은 다른 축의 합으로 역산하지 말고 통으로 판단한다.
   - **앵커 자리(\`{앵커 …: }\`)는 이번 실행에서 비어 있다.** 구간 정의만으로 채점한다. 이 실행은 "앵커 없음" 기준선이다.
   - 만점 구간은 **골드 2종보다 그 항목에서 명백히 나을 때만** 준다. 평범하면 평범하다고 쓴다.
   - 리포트의 "사람 점수"·"사람 사유" 열은 비워 둔다.
2. **플래그** — 2.1의 판단 항목 22개(A1~A10·B2·C1·C2·C3·C5·D1·D3·F1·F2·F4·F5·G1)만. A9(귀속 과밀·소스 순회)·A10(독후감 화법)은 v2.2 신설 — 대본이 주제가 아니라 소스를 소개하거나 읽은 감상을 말하는 것처럼 들리는가로 판단한다. **2.2의 이관 항목(B1·B3·B4·C4·D2·D4·D5·F3·F6)은 플래그하지 않는다** — 코드와 QA가 잰다. 강도는 위반/의심, 15건 이내, 자구 인용 필수, "판정(사람)"·"사유" 열은 비운다.
   - G1: 골드 2종과 대조해 관용구·진입 문구·정리 문구의 재사용을 찾는다.
3. **⭐ 잘된 지점** 3~7건 (빈 판정 열 포함).
4. **집계** 행은 사람 판정 후 채우므로 플래그·⭐ 수만 적는다.

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. 리포트 파일 작성이 먼저다. evidence의 각 항목은 리포트에 적은 인용과 같아야 한다.`;
}

const int = { type: "integer" } as const;
const str = { type: "string" } as const;
export const CRITIC_SCHEMA_V2 = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "evidence", "total", "violations", "suspects", "stars", "report_written", "summary"],
  properties: {
    scores: {
      type: "object", additionalProperties: false, required: ["content", "structure", "naturalness", "immersion", "persona"],
      properties: {
        content: { type: "object", additionalProperties: false, required: ["value", "argument", "perspective", "resonance"], properties: { value: int, argument: int, perspective: int, resonance: int }, description: "가치·깊이 /12 · 논증·귀속 /8 · 관점 /8 · 정서 공명 /7" },
        structure: { type: "object", additionalProperties: false, required: ["opening", "flow", "ending"], properties: { opening: int, flow: int, ending: int }, description: "오프닝 /6 · 전개 /8 · 마무리 /6" },
        naturalness: { type: "object", additionalProperties: false, required: ["spoken", "exchange"], properties: { spoken: int, exchange: int }, description: "구어성 /12 · 주고받기 /8" },
        immersion: { ...int, description: "몰입 /15 — 통으로" },
        persona: { type: "object", additionalProperties: false, required: ["voice", "listener"], properties: { voice: int, listener: int }, description: "말투·역할 /5 · 청취자 관점 /5" },
      },
    },
    evidence: {
      type: "object", additionalProperties: false,
      required: ["content_value", "content_argument", "content_perspective", "content_resonance", "structure_opening", "structure_flow", "structure_ending", "natural_spoken", "natural_exchange", "immersion", "persona_voice", "persona_listener"],
      properties: { content_value: str, content_argument: str, content_perspective: str, content_resonance: str, structure_opening: str, structure_flow: str, structure_ending: str, natural_spoken: str, natural_exchange: str, immersion: str, persona_voice: str, persona_listener: str },
      description: "항목별 근거 — [턴] 자구 인용",
    },
    total: { ...int, description: "12항목 합계 /100" },
    violations: int,
    suspects: int,
    stars: int,
    report_written: { type: "boolean" },
    summary: { type: "string", description: "총평 3문장" },
  },
} as const;

export const CRITIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "violations", "suspects", "stars", "report_written", "summary"],
  properties: {
    scores: { type: "object", additionalProperties: false, required: ["immersion", "naturalness", "density", "persona", "structure"], properties: { immersion: { type: "integer" }, naturalness: { type: "integer" }, density: { type: "integer" }, persona: { type: "integer" }, structure: { type: "integer" } } },
    violations: { type: "integer" },
    suspects: { type: "integer" },
    stars: { type: "integer" },
    report_written: { type: "boolean" },
    summary: { type: "string", description: "총평 3문장" },
  },
} as const;

export interface ClusterInput {
  assetRoot: string;
  midTopic: MidTopic;
  nextIdNumber: number;
  sources: { url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null }[];
  existingTitles: string[];
}

export function buildClusterPrompt(i: ClusterInput): string {
  const a = assetPaths(i.assetRoot);
  const list = i.sources
    .map((s, n) => `${n + 1}. [${s.domain}] ${s.title}${s.published ? ` (${s.published.slice(0, 10)})` : ""}\n   ${s.url}\n   ${(s.summary ?? "").slice(0, 220)}`)
    .join("\n");
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 군집화 담당이다. 스윕된 소스 **메타데이터만** 보고 (원문 접속 금지 — WebFetch 사용 금지) 에피소드 후보를 뽑는다.

## 읽을 파일
- ${a.specBacklog} — 군집화 기준·후보 구성 항목 (특히 "군집의 축 = 주제" 규칙)

## 원칙 (전부 준수)
- **에피소드는 주제(개념·원리·질문)가 이끈다 — 사건 종속 금지.** 후보 제목이 "○○ 사건의 전말"형이면 축이 잘못된 것. 사건·소식성 소스는 사례 재료로만.
- **군집당 소스 5건 이상** (15분 분량 확보 — 3~4건은 분량 미달 실증). 5건을 못 채우면 후보로 내지 말고 예비 메모에만 남긴다. 최소 3건 하한은 절대선.
- 타깃: 자기계발을 원하는 2030 한국 직장인 (IT 개발자 아님). 각 후보에 타깃 정합 한 줄.
- 기존 후보와 축이 겹치면 내지 않는다. 기존 제목: ${i.existingTitles.length ? i.existingTitles.join(" / ") : "(없음)"}
- 후보 ID는 C${i.nextIdNumber}부터 순번 부여. 중분류: ${i.midTopic} (소스가 다른 중분류에 더 맞으면 그 중분류로 표기 가능).
- 후보 수: 성립하는 만큼 (0~6). 억지로 채우지 않는다.

## 소스 메타데이터 (${i.sources.length}건)
${list}

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다.`;
}

export const CLUSTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["candidates", "reserve_notes", "dropped_notes"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "mid_topic", "title", "summary", "target_fit", "angle", "sources", "dedup_note"],
        properties: {
          id: { type: "string" },
          mid_topic: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          target_fit: { type: "string" },
          angle: { type: "string", description: "축 + 전개 순서 한 문단" },
          sources: { type: "array", minItems: 3, items: { type: "object", additionalProperties: false, required: ["url", "title", "publisher", "backbone"], properties: { url: { type: "string" }, title: { type: "string" }, publisher: { type: "string" }, backbone: { type: "boolean" } } } },
          dedup_note: { type: "string" },
        },
      },
    },
    reserve_notes: { type: "array", items: { type: "string" }, description: "성립 가능하나 이번엔 안 낸 군집 메모" },
    dropped_notes: { type: "array", items: { type: "string" }, description: "탈락 사유 메모 (사건 축·소스 부족 등)" },
  },
} as const;

export function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 에피소드 ID 날짜 부분: T{YYMMDD} (KST) */
export function episodeDatePrefix(prefix = "T"): string {
  return prefix + todayKst().slice(2).replace(/-/g, "");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 초안 2단계 (2026-09-08 — "축이 이끄는 파이프라인" ③, spec/04 2장 개정)
//   1단계 설계: 원문 정독 → 넉넉한 발췌(sources.md)·claims·구성안(outline.md)·발음 맵. 원문을 읽는 유일한 지점.
//   2단계 대본: 새 컨텍스트, 원문 없이 발췌·claims·구성안만 인라인으로 받아 대본을 한 번에 돌려준다(도구 없음 — 단발 호출).
//   실험(C28, ~/Desktop/ear-axis-experiments): 구성안이 소스 순회를 끊었고, 헤지·귀속·세부 규칙으로 QA 실패 5→2.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface DesignInput {
  assetRoot: string;
  workRoot: string;
  episodeId: string;
  candidate: BacklogCandidate;
  promptVersion: string;
}

/** 1단계 — 설계 (에이전트 실행: WebFetch + 에피소드 디렉토리 쓰기) */
export function buildDesignPrompt(i: DesignInput): string {
  const a = assetPaths(i.assetRoot, i.workRoot);
  const explainer = explainerFor(i.candidate.mid_topic);
  const host = explainer === "윤아" ? "이음" : "윤아";
  const dir = a.episodeDir(i.episodeId);
  const sources = i.candidate.sources
    .map((s, n) => `${n + 1}. ${s.publisher}, "${s.title}"${s.backbone ? " (뼈대 후보)" : ""} — ${s.url}${s.published ? ` (${String(s.published).slice(0, 7)})` : ""}`)
    .join("\n");
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 **설계 담당**이다. 대본을 쓰지 않는다. 소스 원문을 정독해 재료(발췌·claims)와 구성안을 만든다. 이 단계가 파이프라인에서 원문을 읽는 유일한 지점이며, 다음 단계(대본)는 원문을 보지 못하고 여기서 만든 파일만 본다. 그러므로 **발췌에 없는 사실은 대본에 존재할 수 없다** — 넉넉하게 떠라.

## 0. 먼저 읽을 파일 (이것 외의 프로젝트 파일은 읽지 말 것 — episodes/ 하위 다른 에피소드, critic/qa 리포트 금지)
1. ${a.guidelines} — 대본 규칙 (${i.promptVersion}). 구성안이 이 규칙을 만족할 수 있게 설계한다.
2. ${a.specScript} — 대본 규격·페르소나.
3. 골드 예시: ${a.goldFullEum}, ${a.goldFullYuna} — 톤·리듬의 기준. 문장을 베끼지 않는다.

## 1. 에피소드 정보 (백로그 ${i.candidate.id}, 게이트1 승인 완료)
- 에피소드 ID: ${i.episodeId} · 제목(가): "${i.candidate.title}" · 중분류: ${i.candidate.mid_topic}
- 해설: **${explainer}** / 진행: **${host}** — 역할 고정
- 청취자: 자기계발을 원하는 2030 한국 직장인 (IT 개발자 아님). 편도 30분 통근.
${candidateAxisBlock(i.candidate)}
- 타깃 정합 메모: ${i.candidate.target_fit ?? "-"}

## 2. 소스 (전부 WebFetch로 원문 정독)
${sources}

403·접근 실패 시 우회 금지 — 해당 소스 제외 (최소 3건 유지, 미달 시 중단·보고). 검색 엔진 요약을 근거로 쓰지 않는다.

## 3. 산출물 — 디렉토리 ${dir}/ 에 생성 (이 디렉토리 밖에는 아무것도 쓰지 말 것)

### a) sources.md — 넉넉한 발췌 (내부 증적 · 재배포 금지)
첫 줄에 "> 내부 증적 — 재배포 금지". 소스별로 \`## S{n}. 발행처 — "제목"\` 헤더, 메타(URL·발행일·저자), 그 아래 **원문 발췌 목록**과 한국어 요지 3줄.
- 발췌는 **원문 언어 그대로, 문장 단위로**. 항목 ID는 \`S1-01\`, \`S1-02\`… 형식.
- **넉넉함의 기준**: 소스당 10~20개, 각 1~4문장. 요지 요약이 아니라 대본이 인용·재서술할 만한 대목을 전부 뜬다 — 핵심 주장, 수치·조사 설계, 구체 사례·일화, 저자의 단서·한계 서술, 인용된 다른 연구의 이름과 결론, 실천 제안.
- 판단 기준: "대본 작가가 이 대목을 쓰고 싶어 했는데 발췌에 없어서 못 쓰는 일"이 없어야 한다. 빠뜨리는 쪽이 넘치는 쪽보다 비용이 크다.
- **발췌가 말하지 않는 것을 요지에 보태지 않는다** — 인물의 성별·연령·관계, 문장의 원문 내 위치("마지막 문장"), 순서·수량은 원문에 그대로 있는 정도까지만.

### b) claims.md — 사실 주장 대조표
표 한 개: \`| C## | 주장 (한국어, 한 문장) | 발췌 ID | 유형 |\`. 유형은 수치·인용·고유명사·인과·정의·실천 중 하나.
- **발췌 ID가 없는 주장은 적을 수 없다.** 두 발췌를 합쳐야 성립하는 주장은 두 ID를 다 적는다.
- 주장 문장은 발췌보다 구체적이면 안 된다 — 발췌의 헤지("~일 수 있다", "때로", "일부")와 귀속 주체("이 글은/기사는" vs 원저자 발언)를 그대로 옮긴다.
- 소스 사이를 잇는 해석("A와 B는 같은 원리다")은 여기 적지 않는다 — 그건 구성안의 "연결·비유" 목록으로 간다.

### c) outline.md — 구성안 (대본 단계의 계약)
아래 형식을 그대로 따른다.

\`\`\`
# 구성안 — ${i.episodeId}

축: [대립|역설|재정의] 한 문장
축 해설: 왜 이 축이 청취자에게 긴장을 만드는가, 두 줄
착지 구간: #n — 축이 증명되는 자리 (마무리가 아니어도 된다)
예상 분량: n분 (재료 총량 기준 — 아래 분량 규칙)

역할표
- 근거 앵커: S? (축의 핵심 주장을 받치는 소스)
- 사례: S?, S? (청취자 일상 또는 구체 일화)
- 반론·한계: S?
- 수치·조사: S?
- 역사·맥락: S?  (없으면 "없음"이라고 쓰고 그 공백을 명시)
역할 없는 소스: S? — 제외 사유

구간 #1 — 소제목
  목적: 청취자에게 남길 것 한 줄
  재료: C01, C03 (S1) · C07 (S3)   ← 한 구간에 소스 2개 이상이 원칙. 한 소스만 쓰는 구간은 최대 1개. 사례·일화 재료는 구간당 하나만(예시 과다 방지)
  진행자 질문: 기원 서사가 붙은 질문 한 개 (왜 궁금해졌는지 한 조각 + 질문)
  전환 장치: 번역 맞장구로 닫기 | 인용구 던지기 | 되물음 | 딴 얘기 끼어들기 | 역질문 중 하나
  비율: n%
구간 #2 … (본문 구간 4~6개. 도입은 구간에 넣지 않는다 — [도입] 구역이 따로 맡는다. **한 소스의 재료가 본문의 1/3 을 넘지 않게**, 소스의 서술 순서를 그대로 구간 순서로 삼지 않는다 — 기사 순서가 구조가 되면 나열이 이해를 앞선다)

연결·비유 (대본이 만드는 것 — 사실이 아님, QA 대상 아님)
- "X를 Y로 옮김" — 근거 C##/C##, 어느 구간에서
- …

마무리 한 줄: "무엇을 이해하게 됐나"
비율 합계: 도입 5~10 / 본문 75~85 / 마무리 10~15
\`\`\`

설계 규칙:
- 축은 반드시 대립("A인데 B"), 역설("A하려다 B가 된다"), 재정의("A는 사실 B다") 중 하나. "X란 무엇인가"형은 축이 아니다. 사건이 아니라 개념이 이끈다 (규칙 13-1).
- **소스 순회 금지**: 구간이 소스 단위로 나뉘면 실패다. 구간은 축의 논리 단계로 나누고, 각 단계에 여러 소스의 재료를 배치한다.
- 착지 구간을 반드시 지정하고, 그 구간의 재료가 실제로 축을 증명하는지 스스로 확인한다.
- 전환 장치는 구간마다 다르게 — 같은 장치 연속 금지.
- 청취자 일상 사례 왕복은 에피소드 전체에 최소 2회.
- **구간 소제목·진행자 질문·설계 메모에도 발췌 밖 수치·환산을 쓰지 않는다** — "1960년대"를 "60년 된"으로 바꾸는 식의 경과 연수 환산, 발췌에 없는 비교 축은 소제목에서도 QA 실패다 (T260908-001 1회차 실패가 소제목이었다).
- **분량 규칙** (2026-09-08 확정): 한 편은 **13분(공백·기호 제외 약 4,000자) 이상이 필수**, 15분이 평균 목표, 상한은 없다. 재료 총량으로 예상 분량을 적는다. 재료가 13분에 못 미치면 구성안을 만들지 말고 완료 보고에 사유를 적는다(반려 대상). 재료가 26분 이상이면 각 편이 13분 이상이 되는 분할안을 완료 보고 \`split_proposal\`에 적되, 구성안은 한 편 기준으로 그대로 만든다 (분할은 사람이 결정).

### d) pronunciations.json — 대본에 등장할 모든 비한글 표기(영문 용어·인명·기관·매체) → 한글 발음. \`{"표기": "발음"}\` 객체 하나. 없으면 \`{}\`.

## 4. 자기 점검 (필수 — python 등으로 기계 확인)
- claims의 모든 행에 발췌 ID가 있는가. 발췌 ID가 실제 sources.md에 존재하는가.
- 구성안의 재료 ID가 전부 claims에 있는가.
- 소스 단위 구간이 없는가. **한 소스의 재료가 본문 구간의 1/3 을 넘지 않는가**, 소스의 서술 순서가 그대로 구간 순서가 되지 않았는가 (판정: "음료 얘기가 불필요하게 길었음" — 기사 순서가 구조가 되면 나열이 이해를 앞선다). 착지 구간이 지정됐는가. 예상 분량이 13분 이상인가.

## 5. 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다.`;
}

export const DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["axis", "axis_type", "landing_section", "sections", "excerpts", "claims", "estimated_minutes", "split_proposal", "sources_used", "sources_excluded", "gaps", "self_check", "notes"],
  properties: {
    axis: { type: "string" },
    axis_type: { type: "string", enum: ["대립", "역설", "재정의"] },
    landing_section: { type: "integer" },
    sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "title", "sources", "ratio"], properties: { n: { type: "integer" }, title: { type: "string" }, sources: { type: "array", items: { type: "string" } }, ratio: { type: "integer" } } } },
    excerpts: { type: "integer", description: "sources.md 발췌 항목 수" },
    claims: { type: "integer" },
    estimated_minutes: { type: "number", description: "재료 총량 기준 예상 분량" },
    split_proposal: { type: "string", description: "26분 이상일 때 각 편 13분 이상이 되는 분할안. 없으면 빈 문자열" },
    sources_used: { type: "array", items: { type: "string" } },
    sources_excluded: { type: "array", items: { type: "object", additionalProperties: false, required: ["url", "reason"], properties: { url: { type: "string" }, reason: { type: "string" } } } },
    gaps: { type: "array", items: { type: "string" }, description: "비어 있는 역할" },
    self_check: { type: "string" },
    notes: { type: "string" },
  },
} as const;

export interface WriteInput {
  episodeId: string;
  candidate: BacklogCandidate;
  introStyle: (typeof INTRO_STYLES)[number];
  promptVersion: string;
  templates?: Templates | null;
  /** 클로징 인사 골격 선택 시드 (에피소드 수) — 여러 골격이면 돌아가며 */
  signoffSeed?: number;
  majorTopic?: string;
  /** 설계의 예상 분량(분) — 2단계의 분량 목표. 없으면 15 */
  estimatedMinutes?: number;
  /** 인라인 반입 — 이 단계는 파일을 읽지 않는다 (도구 없음) */
  guidelines: string;
  specScript: string;
  goldFullEum: string;
  goldFullYuna: string;
  sourcesMd: string;
  claimsMd: string;
  outlineMd: string;
  pronunciationsJson: string;
}

/** 2단계에서 claims 를 옮길 때의 규칙 — 첫 실험(C28) QA 실패 7건이 전부 이 네 유형이었다 */
export const WRITE_FACT_RULES = `- **사실 주장**(수치·인용·고유명사·인과·정의)은 claims.md의 행만 쓰고, 해설 담당의 턴에서만 말한다. 진행 담당은 감상·추측·되물음만.
- **claims 행을 옮길 때 한 뼘도 더 가지 않는다**:
  1. 헤지·양태를 그대로 — claims가 "~일 수 있다", "때로", "일부", "~로 알려져 있다"면 대본도 그 강도로. 단정("~이다", "흔하다")으로 올리지 않는다. 가설로 제시된 문장("~라고 추정했다")을 결과처럼 쓰지 않는다.
  2. 귀속 주체를 그대로 — claims의 주체가 "이 글은/기사는"이면 원저자 발언("○○가 그 예를 든다", "~가 말한다")으로 바꾸지 않는다. 서평·소개 기사 본문의 서술과 그 안의 인용은 다르다. 확실치 않으면 매체 귀속("이 글은 ~라고 해요")으로 낮춘다.
  3. 소스의 예시에 우리가 덧붙인 장면을 소스 귀속 문장 안에 넣지 않는다 — 발췌에 "회의실"이 없으면 "이 글은 회의실 예를 들어요"라고 쓸 수 없다. 장면을 옮기고 싶으면 화자의 번역으로 분리한다("이걸 회의실로 옮기면…", 또는 진행자의 일상 장면).
  4. **발췌보다 구체적으로 쓰지 않는다** — 성별·연령·관계(sister→"여동생" 금지, "자매"까지), 순서·위치("그 글의 마지막 문장" — 발췌가 말하지 않으면 "그 글에 이런 문장이 있어요"), 수량·빈도는 원문이 밝힌 정도까지만.
- **구성안은 구조의 계약이지 문구의 계약이 아니다** — 구성안의 소제목·진행자 질문·설계 메모에 claims 범위를 넘는 표현(환산 수치·발췌에 없는 비교)이 있으면 대본에서 고쳐 쓴다. 소제목(\`### #n\`)도 QA 대상이다.
- **귀속은 claims 의 \`귀속\` 열대로** (guidelines 규칙 20~22, 2026-09-09):
  · \`불필요\` 주장은 **해설자가 자기 말로 설명한다** — "이 글은 ~라고 해요", "~에 따르면"으로 감싸지 않는다. 사실 검증은 claims 로 하므로 출처를 말하지 않아도 된다.
  · \`필수\` 주장만 귀속을 단다. 그중 **매체명·저자명을 말하는 것은 근거 앵커의 첫 소개 · 직접 인용 · 특정인의 의견**일 때뿐이고, 나머지는 익명 귀속("한 연구에서는", "어느 글은", "연구진은"). 소스당 이름 언급 최대 2회, 이름이 나오는 소스는 2~3곳까지.
  · 소스는 처음 나올 때 한 문장으로 소개하고 끝. "아까 그 기사", "같은 글에서", "다른 글에서는" 식 되돌림·갈아타기를 쓰지 않는다 — 구성안의 축이 이끄는 한 흐름 안에 사실을 놓는다.
  · 자기 점검: 해설 턴 중 귀속 표현이 있는 턴이 절반을 넘으면 소스 순회다. L0 가 60% 초과를 재생성으로 돌린다.
- **해설자는 독자가 아니라 아는 사람이다** (규칙 23): "저도 그 부분에서 멈췄어요", "다시 읽어보니", "저도 그렇게 읽었어요", "이 문장이 인상적이었는데", "글을 읽다가" 같은 **읽은 경험·감상 서술 금지**. 짚고 싶은 대목은 내용을 직접 말한다("여기서 중요한 건 ~예요"). L0 가 이 표현을 잡아 재생성한다.
- **연결·비유**(소스 사이를 잇는 해석, 청취자 일상으로 옮기는 번역)는 구성안의 "연결·비유" 목록을 쓴다. 새로 만든 연결·비유는 완료 보고 bridges 에 전부 적는다. 비유는 직전 해설의 재료로 만든다 — 새 재료를 끌어오지 않는다. 소스 사이 병치는 "두 글이 서로를 인용한 건 아니지만" 같은 하향 표지로 해석임을 밝힌다.`;

/** 2단계 — 대본 (단발 호출: 도구 없음, 모든 입력 인라인, 대본은 완료 보고 JSON 의 script 로 돌려준다) */
export function buildWritePrompt(i: WriteInput): string {
  const explainer = explainerFor(i.candidate.mid_topic);
  const host = explainer === "윤아" ? "이음" : "윤아";
  const fence = (s: string) => "````\n" + s.trim() + "\n````";
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 **대본 작가**다. 청취자는 자기계발을 원하는 2030 한국 직장인 (IT 개발자 아님). 2인 대화 팟캐스트 대본을 쓴다.

이 단계에는 소스 원문이 없고 도구도 없다. 필요한 것은 전부 이 프롬프트 안에 있다 — 파일을 읽거나 검색하지 않는다. 당신이 쓸 수 있는 사실은 **claims.md에 있는 것이 전부**이고, 전개는 **outline.md가 계약**이다. 기억으로 보충하지 않는다 — 발췌에 없는 사실을 쓰면 그 대본은 폐기된다.

## 1. 에피소드 정보 (백로그 ${i.candidate.id})
- 에피소드 ID: ${i.episodeId} · 제목(가): "${i.candidate.title}" · 중분류: ${i.candidate.mid_topic}
- 해설: **${explainer}** / 진행: **${host}** — 역할 고정, 페르소나는 spec/04 3장.
- 제목은 구성안의 축에 맞게 새로 지어도 된다 (클릭베이트 금지).

## 2. 규칙 (전부 준수)
### 2.1 대본 규칙 — guidelines (${i.promptVersion})
${fence(i.guidelines)}

### 2.2 대본 규격·페르소나 — spec/04 (3~6장)
${fence(specSections(i.specScript, [3, 4, 5, 6]))}

### 2.3 골드 예시 — 톤·리듬·티키타카의 기준 (이 에피소드와 같은 역할 배치: ${explainer} 해설)
${GOLD_USAGE}
${fence(explainer === "이음" ? i.goldFullEum : i.goldFullYuna)}

## 3. 이 에피소드의 재료
### 3.1 구성안 — outline.md (계약: 구간 순서·목적·재료·진행자 질문·전환 장치를 그대로 실행한다)
${fence(i.outlineMd)}

### 3.2 사실 주장 대조표 — claims.md (쓸 수 있는 사실의 전부)
${fence(i.claimsMd)}

### 3.3 소스 발췌 — sources.md (claims 의 원문 근거. 인용·재서술의 강도를 여기에 맞춘다)
${fence(i.sourcesMd)}

### 3.4 발음 맵 — pronunciations.json (등재된 표기만 대본에 쓰는 것이 원칙. 새 비한글 표기를 도입하면 완료 보고 pronunciations_added 에 발음을 적는다)
${fence(i.pronunciationsJson)}

## 4. 대본 규격
### 구조 (spec/04 4장)
- 첫 줄 메타: \`에피소드 ID · 제목 · 중분류 · 해설/진행 · 프롬프트 버전 ${i.promptVersion} · 사용 소스 수\`
- 구역 헤더는 \`## [인트로]\` \`## [도입]\` \`## [본문]\` \`## [마무리]\` 4개뿐. **[콜드오픈] 구역은 폐지** — 만들지 않는다.
- [본문] 안의 구간 경계는 \`### #n 소제목\` 한 줄로 표시한다 (구성안의 구간 번호·순서 그대로. TTS는 이 줄을 읽지 않는다).
${templateBlock({ templates: i.templates, majorTopic: i.majorTopic, signoffSeed: i.signoffSeed } as DraftInput)}
- 도입 (규칙 13): 주제 선언 뒤 첫 해설 턴 사이에 청취자가 "대화에 앉는" 두세 턴. 주제를 다시 발견하는 척 금지. 이 에피소드의 진입 방식: **${i.introStyle.label}** — ${i.introStyle.hint}

### 줄 문법 (TTS 파서 계약 — 정확히)
- 번호 턴은 \`[윤아] E1 · 문장\` / \`[이음] Y1 · 문장\`. 화자 라벨이 먼저, 번호 뒤는 **가운뎃점(·)**. \`E1.\`·\`E1 [윤아]\` 변형 금지.
- 해설 턴 E, 진행 턴 Y, 각각 1부터 연번. 표·URL·괄호 주석 금지. 숫자·영문은 가독 표기 — 음차는 발음 맵이 맡는다.

### 사실과 연결의 구분
${WRITE_FACT_RULES}

### 분량 (2026-09-08 확정 규칙)
- **이 에피소드의 목표: 약 ${i.estimatedMinutes ?? 15}분 = 공백·기호 제외 약 ${Math.round((i.estimatedMinutes ?? 15) * 350)}자 (±15%)** — 구성안의 "예상 분량"이다 (350자/분). 하한 13분(약 4,000자)은 필수이고 상한을 규칙으로 두지는 않지만, **예상 분량은 설계가 재료 총량으로 이미 정한 크기다** — 그보다 크게 쓰는 것은 재료가 많아서가 아니라 풀어 쓰기가 길어진 것이다.
- **claims 는 쓸 수 있는 것의 상한이지 채워야 할 목록이 아니다.** 구간의 목적에 필요한 것만 쓴다. 채우기용 잡담·같은 말 반복 금지. 구간 비율(구성안의 %)은 참고값 — 비율을 맞추려고 문장을 늘리지 않는다.
- 턴 길이 규격: 해설 1턴 2~5문장(에피소드 평균), **한 턴 최대 6문장** — 7문장 이상 턴은 L0가 잡아 재생성한다. 진행 1턴 1~2문장.

## 5. 자기 점검 (출력 전에, 머릿속에서 끝까지)
- 구간 헤더의 순서·개수가 구성안과 같은가. 4,000자 이상인가. 해설 턴 평균 문장 수가 5 이하인가.
- **해설 턴의 사실 문장마다** 대응하는 claims 행이 있는가, 헤지·귀속 주체가 같은가, 발췌보다 구체적이지 않은가. 어긋난 문장은 삭제하거나 claims 범위로 축소한 뒤 self_check_fixes 에 적는다. 결과를 turn_claims(턴별 사용 claims ID)로 보고한다.
- 진행 턴에 사실 주장이 없는가. 지시어·콜백("아까 그 ~")이 가리키는 대상이 대본 안에 있는가.
- **용어 (규칙 24)**: 청취자(IT·경제·생물학 비전공 직장인)가 모를 전문 용어·외국어 개념·통계 표현을 전부 terms 에 적는다 — 한 턴에 하나, 그 자리에서 한 문장으로 풀었거나 다음 진행 턴이 되물어 풀게 했는가. 풀지 못한 용어는 이름 없이 현상으로 바꿔 쓴다. 논문 결과 문장("평균적으로 더 큰 순유출이 났다", "공통 흐름이 반대로 움직였다")은 말로 옮긴다("돈이 더 많이 빠져나갔다", "한쪽이 오르면 다른 쪽이 내렸다"). (판정 6편 공통 저점: "어려운 말이 많은데 풀어가는 과정이 없다")
- **사례 상한**: 사례·일화·예시 문장은 구간당 하나, 에피소드에 4~5개. 같은 개념에 두 번째 예시를 붙이지 않는다 — 모든 것을 예시로 해결하면 논지가 사라진다 (판정: "예시가 너무 많음").
- **뜸**: 해설이 연속 열 턴 넘게 말줄임표 없이 흐르지 않는가 (규칙 7 — L0 가 잡는다). 긴 해설 구간에는 문장 중간 뜸("...")을 둔다.
- **골드 문장 복제**: 골드의 확인구·역질문 진입·마무리 마지막 문장 틀("한 번쯤 떠올려 보셔도", "그 그림이 맞습니다", "정확히 ~의 핵심")을 자리째 쓰지 않았는가 (L0 가 2회 이상이면 잡는다).

## 6. 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. script 필드에 script.md 전문(첫 줄 메타부터 마지막 턴까지, 마크다운 그대로)을 넣는다.
**완료 보고 전에 대본이나 설명을 일반 텍스트로 먼저 쓰지 않는다** — 대본은 JSON 안에 한 번만 존재한다 (두 번 쓰면 출력 비용이 두 배가 된다).`;
}

export const WRITE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "script", "sections_followed", "turn_claims", "bridges", "pronunciations_added", "self_check_fixes", "notes"],
  properties: {
    title: { type: "string" },
    script: { type: "string", description: "script.md 전문 (마크다운)" },
    sections_followed: { type: "boolean", description: "구성안 구간 순서·개수 준수" },
    turn_claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "claims"], properties: { turn: { type: "string" }, claims: { type: "array", items: { type: "string" } } } }, description: "해설 턴별 사용 claims ID" },
    bridges: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "note"], properties: { turn: { type: "string" }, note: { type: "string", description: "무엇을 무엇으로 옮김 · 근거 C##" } } }, description: "구성안에 없던 새 연결·비유 전부" },
    pronunciations_added: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string" }, reading: { type: "string" } } } },
    self_check_fixes: { type: "array", items: { type: "string" } },
    terms: { type: "array", description: "청취자가 모를 전문 용어·외국어 개념·통계 표현 전부 (규칙 24). 각 용어를 어느 턴에서 어떻게 풀었는지", items: { type: "object", additionalProperties: false, required: ["term", "turn", "explained_by"], properties: { term: { type: "string" }, turn: { type: "string", description: "처음 나오는 턴 id (E7)" }, explained_by: { type: "string", description: "같은 턴의 풀이 문장 인용, 또는 되묻는 진행 턴 id (Y8)" } } } },
    notes: { type: "string", description: "특이사항 (역질문 위치, 비유 계열, 분량 판단) 3문장 이내" },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// QA 단발화 (2026-09-08 — 비용 절감 ②): 입력 3종 + QA 프롬프트 자산 + spec/05 를 전부 인라인으로 넣고 도구 없이
// 판정·리포트를 JSON 으로 돌려받는다. 에이전트 루프(파일 읽기·리포트 쓰기·python 검사)의 턴별 문맥 재읽기가 사라진다.
// 회차 2+ 는 이전 회차 실패와 작성 측 수정 내역(diff 만)을 함께 받아 "해소 여부 + 바뀌지 않은 문장의 판정 안정성"을 지킨다 (spec/05 5장).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface QaInlineInput {
  episodeId: string;
  attempt: number;
  qaPromptMd: string;
  specQaMd: string;
  scriptMd: string;
  claimsMd: string;
  sourcesMd: string;
  /** 이전 회차 QA 실패 (회차 2+) */
  priorFailures?: { location: string; item: string; reason: string }[];
  /** 작성 측이 보고한 수정 내역 — 바뀐 자리만 (작성 맥락은 넘기지 않는다) */
  fixes?: { location: string; before: string; after: string }[];
  /** 사람 수정 후 재QA (웹 [재QA 요청]) */
  humanRevision?: boolean;
}

export function buildQaPromptInline(i: QaInlineInput): string {
  const fence = (s: string) => "````\n" + s.trim() + "\n````";
  const prior = i.attempt > 1 && (i.priorFailures?.length || i.fixes?.length)
    ? `
## 이전 회차 (attempt ${i.attempt - 1}) — 판정 안정성 규칙
이전 회차의 실패 지적과 그에 대한 작성 측 수정 내역이다. **작성 측의 판단·맥락은 없고 바뀐 자리만 있다.**
### 이전 회차 실패
${(i.priorFailures ?? []).map((f, n) => `${n + 1}. [${f.location}] 항목 ${f.item}: ${f.reason}`).join("\n") || "- (없음)"}
### 작성 측 수정 내역
${(i.fixes ?? []).map((f, n) => `${n + 1}. ${f.location}\n   전: ${f.before}\n   후: ${f.after}`).join("\n") || "- (기록 없음)"}

규칙:
1. 이전 회차 실패가 **해소됐는지 먼저** 판정한다 — 수정 후 문장이 발췌 범위 안인지, 수정이 다른 턴의 지시어·콜백을 깨뜨리지 않았는지.
2. **이번 회차에서 바뀌지 않은 문장은 이전 회차가 통과시킨 것이다.** 그 문장을 새로 실패로 뒤집는 것은 **명백한 사실 오류**(발췌와 다른 수치·연대·귀속, 발췌에 없는 고유명사·인용·결론)일 때만 한다. 헤지 어감의 미세한 차이, 한정어의 유무, 매체 지칭의 세부 같은 **경계 사례는 실패가 아니라 비고**로 남긴다 — 회차마다 다른 경계 사례를 잡으면 재생성이 수렴하지 않는다 (T260908-001: 2회차 실패 3건이 전부 1회차에 그대로 있던 문장이었다).
3. 수정으로 새로 생긴 문장·바뀐 문장은 1회차와 같은 엄격함으로 본다.`
    : "";
  const human = i.humanRevision ? `\n(이 대본은 사람이 웹에서 수정한 뒤 재QA를 요청한 것이다 — 사람 수정도 환각·중복을 만들 수 있으므로 1회차와 같은 엄격함으로 전수 검사한다.)` : "";
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 QA 검수자다. 대본의 사실 무결성을 독립 검증한다. 생성 맥락은 일절 모른 채 검사하는 것이 원칙이다.${human}

이 실행에는 도구가 없다. 필요한 것은 전부 아래에 있다 — 파일을 읽거나 원문 URL 에 접속하지 않는다. 검증 기준은 소스 발췌가 최종이다.

## 1. QA 절차·항목 정의 (프롬프트 자산 — 이 문서의 검사 항목과 판정 규약을 그대로 따른다)
${fence(i.qaPromptMd)}

## 2. QA 명세 — spec/05
${fence(i.specQaMd)}

${QA_ITEM6_NOTE}

특히 주의 깊게 볼 유형: ① 발췌에 없는 주장 (비교 축 추가, 연관의 방향 확정, 귀속 범위 확장, 연대·수치의 무근거 환산, 문장 위치 주장) — **본문 소제목(\`### #n\`)도 검사 대상**, ② 귀속 정확성 — 게재 매체 지시("~라는 매체", "같은 매체", "아까 그 ~")가 발췌의 실제 게재처와 일치하는지 지시 사슬 전수 추적, ③ 수치·시점의 상향 왜곡 (하향 범위 표현은 의도된 규격), ④ 구역이 [인트로]·[도입]·[본문]·[마무리] 4개인가 ([콜드오픈] 구역이 있으면 위반 — 2026-09-07 폐지), ⑤ 화자 규칙 (진행 담당의 사실 주장 금지 — 감상·추측 허용), ⑥ 수정 잔존 참조 (지시어·콜백이 가리키는 대상이 현재 대본 안에 실재하는지), ⑦ claims가 스스로 "발췌 밖" 등으로 표시한 항목은 그 판단을 믿지 말고 발췌 기준으로 독립 재판정. 소스 사이를 잇는 해석·비유·청취자 일상 번역은 해석임이 표시돼 있으면(“제 연결인데”, “~로 옮기면”, “서로를 인용한 건 아니지만”) 사실 주장이 아니다. **귀속 표현이 없는 사실 문장은 귀속 부재 자체를 실패로 잡지 않는다** — claims·발췌 대조로만 판정한다 (2026-09-09 귀속 등급 규칙: 개념·원리·정의는 해설자의 말로 하는 것이 규격이다). 익명 귀속("한 연구에서는")은 그 주장이 어느 발췌에든 있으면 통과다.
${prior}

## 3. 검사 대상 — ${i.episodeId} attempt ${i.attempt}
### 3.1 대본 script.md
${fence(i.scriptMd)}

### 3.2 claims 대조표 claims.md (검증의 지도 — 최종 기준은 아니다)
${fence(i.claimsMd)}

### 3.3 소스 발췌 sources.md (검증의 최종 기준)
${fence(i.sourcesMd)}

## 4. 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. report_md 에는 QA 프롬프트 자산의 출력 규격대로 "### 항목별 판정" 표(10행) · "### 실패 상세" 표 · "### 비고 — 실패로 잡지 않은 경계 사례" · "### 종합 판정"을 마크다운으로 넣는다 (파일 헤더·attempt 헤더는 워커가 붙인다). failures 배열과 실패 상세 표는 같은 내용이어야 한다. 완료 보고 전에 다른 텍스트를 출력하지 않는다.`;
}

export const QA_INLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "failures", "holds", "resolved_prior", "report_md", "summary"],
  properties: {
    verdict: { type: "string", enum: ["qa_passed", "failed"] },
    failures: { type: "array", items: { type: "object", additionalProperties: false, required: ["location", "item", "reason"], properties: { location: { type: "string", description: "턴 번호 + 첫 몇 단어" }, item: { type: "string", description: "spec/05 항목 번호" }, reason: { type: "string" } } } },
    holds: { type: "array", items: { type: "string" }, description: "규약상 보류 항목 (7 등)" },
    resolved_prior: { type: "array", items: { type: "object", additionalProperties: false, required: ["location", "resolved", "note"], properties: { location: { type: "string" }, resolved: { type: "boolean" }, note: { type: "string" } } }, description: "이전 회차 실패의 해소 여부 (회차 2+). 1회차는 빈 배열" },
    report_md: { type: "string", description: "qa-report.md 에 붙일 이번 회차 리포트 본문 (마크다운)" },
    summary: { type: "string" },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 설계 단발화 (2026-09-08 — 비용 절감 ③): 소스 본문은 코드가 가져와 문단 ID(S{n}-{NN})를 붙여 인라인으로 넣고, 모델은 도구 없이
// 발췌 "선택"(ID 목록)·claims·구성안·발음 맵을 JSON 으로 돌려준다. 발췌 본문은 워커가 원문 그대로 옮긴다 — 인용 환각이 구조적으로 사라지고
// 출력 토큰(구 방식 4만+)이 claims·구성안만으로 준다. 에이전트 루프(WebFetch·파일 쓰기·python 점검 29턴)의 문맥 재읽기도 사라진다.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface InlineSource {
  n: number; url: string; publisher: string; title: string; published?: string | null; backbone?: boolean;
  ok: boolean; byline?: string | null; note?: string | null;
  blocks: { id: string; text: string }[];
  /** 다른 편이 이미 발췌한 문단 — 본문 없이 자리만 보여 준다 (2026-09-10 문단 단위 중복 방지). by = 그 편의 에피소드 ID */
  usedBlocks?: { id: string; by: string }[];
}

export interface DesignInlineInput {
  episodeId: string;
  candidate: BacklogCandidate;
  promptVersion: string;
  guidelines: string;
  specScript: string;
  goldFullEum: string;
  goldFullYuna: string;
  sources: InlineSource[];
}

export function buildDesignPromptInline(i: DesignInlineInput): string {
  const explainer = explainerFor(i.candidate.mid_topic);
  const host = explainer === "윤아" ? "이음" : "윤아";
  const fence = (s: string) => "````\n" + s.trim() + "\n````";
  const srcBlocks = i.sources.map((s) => {
    const head = `### S${s.n}. ${s.publisher} — "${s.title}"${s.backbone ? " (뼈대 후보)" : ""}\n- URL: ${s.url}${s.published ? ` · 발행 ${String(s.published).slice(0, 10)}` : ""}${s.byline ? ` · 저자 ${s.byline}` : ""}`;
    if (!s.ok) return `${head}\n- **본문 없음** (${s.note ?? "가져오기 실패"}) — 이 소스는 제외 대상. sources_excluded 에 사유를 적는다.`;
    const used = s.usedBlocks ?? [];
    const usedNote = used.length ? `\n- **이미 쓴 대목 ${used.length}문단 제외** (${[...new Set(used.map((u) => u.by))].join("·")} 에서 발췌함) — 아래 ⛔ 자리의 내용은 이 편에서 쓸 수 없다. 남은 문단으로 다른 대목을 쓰거나, 얇으면 이 소스를 제외한다` : "";
    const all = [...s.blocks.map((b) => ({ id: b.id, line: `[${b.id}] ${b.text}` })), ...used.map((u) => ({ id: u.id, line: `[${u.id}] ⛔ (${u.by} 에서 이미 쓴 대목 — 제외)` }))]
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    return `${head}${s.note ? `\n- 추출 메모: ${s.note}` : ""}${usedNote}\n${all.map((x) => x.line).join("\n")}`;
  }).join("\n\n");
  const anyUsed = i.sources.some((s) => s.usedBlocks?.length);
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 **설계 담당**이다. 대본을 쓰지 않는다. 소스 본문을 정독해 재료(발췌·claims)와 구성안을 만든다. 다음 단계(대본)는 원문을 보지 못하고 여기서 만든 파일만 본다. 그러므로 **발췌에 없는 사실은 대본에 존재할 수 없다** — 넉넉하게 골라라.

이 실행에는 도구가 없다. 소스 본문은 아래 4장에 문단 ID 와 함께 전부 들어 있다 — 검색하거나 기억으로 보충하지 않는다. **발췌는 당신이 쓰는 것이 아니라 고르는 것이다**: 문단 ID 목록을 돌려주면 워커가 원문 그대로 sources.md 에 옮긴다.

## 1. 규칙 (구성안이 이 규칙을 만족할 수 있게 설계한다)
### 1.1 대본 규칙 — guidelines (${i.promptVersion})
${fence(i.guidelines)}
### 1.2 대본 규격·페르소나 — spec/04 (3·4·6·7장)
${fence(specSections(i.specScript, [3, 4, 6, 7]))}
### 1.3 골드 예시 — 구간 형태·리듬의 기준 (같은 역할 배치: ${explainer} 해설. 문장을 베끼지 않는다)
${fence(explainer === "이음" ? i.goldFullEum : i.goldFullYuna)}

## 2. 에피소드 정보 (백로그 ${i.candidate.id}, 게이트1 승인 완료)
- 에피소드 ID: ${i.episodeId} · 제목(가): "${i.candidate.title}" · 중분류: ${i.candidate.mid_topic}
- 해설: **${explainer}** / 진행: **${host}** — 역할 고정
- 청취자: 자기계발을 원하는 2030 한국 직장인 (IT 개발자 아님). 편도 30분 통근.
${candidateAxisBlock(i.candidate)}
- 타깃 정합 메모: ${i.candidate.target_fit ?? "-"}

## 3. 산출물 규칙 (완료 보고 JSON 의 각 필드)

### a) excerpt_ids — 넉넉한 발췌 선택
- 소스당 10~20개 문단 ID. 핵심 주장, 수치·조사 설계, 구체 사례·일화, 저자의 단서·한계 서술, 인용된 다른 연구의 이름과 결론, 실천 제안을 전부. "대본 작가가 이 대목을 쓰고 싶어 했는데 발췌에 없어서 못 쓰는 일"이 없어야 한다 — 빠뜨리는 쪽이 넘치는 쪽보다 비용이 크다.
- **claims 가 참조하는 ID 는 반드시 excerpt_ids 에 있어야 한다.**
- gists: 소스마다 한국어 요지 3줄. 발췌가 말하지 않는 것을 요지에 보태지 않는다 — 인물의 성별·연령·관계, 문장의 원문 내 위치, 순서·수량은 원문에 있는 정도까지만.
- 본문이 없거나 너무 얇은 소스는 제외하고 sources_excluded 에 사유. 최소 3건 유지, 미달이면 구성안을 만들지 말고 notes 에 보고.${anyUsed ? `
- **⛔ 문단은 다른 편이 이미 쓴 대목이다** — excerpt_ids·claims 에 넣지 않는다(넣으면 설계가 실패한다). 같은 소스라도 남은 문단으로 **다른 대목**을 쓴다. 남은 문단이 그 편과 같은 이야기를 반복하게 만들면 이 소스를 제외하고 sources_excluded 에 "이미 쓴 대목"이라고 적는다.` : ""}

### b) claims — 사실 주장 대조표
- 각 항목: id(C01…) · text(한국어 한 문장) · excerpt_ids(근거 문단 ID — 없으면 적을 수 없다. 두 문단을 합쳐야 성립하면 둘 다) · type(수치·인용·고유명사·인과·정의·실천).
- 주장 문장은 발췌보다 구체적이면 안 된다 — 발췌의 헤지("~일 수 있다", "때로", "일부")와 귀속 주체("이 글은/기사는" vs 원저자 발언)를 그대로 옮긴다. 연대를 경과 연수로 환산하지 않는다.
- **attribution — 귀속 등급** (guidelines 규칙 20): \`필수\` = 직접 인용 · 수치·조사 결과 · 특정인의 의견·해석·예측 · 논쟁적/반직관적 주장. \`불필요\` = 개념·원리·정의 · 널리 알려진 사실 · 소스가 설명하는 일반 메커니즘. 대본은 \`불필요\` 주장을 해설자의 말로 설명하고 출처를 달지 않는다. **절반 이상이 \`필수\`면 등급을 다시 본다** — 대부분의 설명은 불필요 등급이다.
- 소스 사이를 잇는 해석("A와 B는 같은 원리다")은 여기 적지 않는다 — 구성안의 "연결·비유" 목록으로.
- 역할표의 **근거 앵커 1~2곳이 대본에서 이름이 불리는 소스**다(규칙 21). 나머지 소스는 익명 귀속("한 연구", "어느 글")으로만 등장하므로, 이름을 꼭 불러야 할 소스(직접 인용·특정인 의견의 출처)가 있으면 근거 앵커로 두거나 설계 메모에 적는다.

### c) outline_md — 구성안 (대본 단계의 계약). 아래 형식을 그대로 따른다.
\`\`\`
# 구성안 — ${i.episodeId}

축: [대립|역설|재정의] 한 문장
축 해설: 왜 이 축이 청취자에게 긴장을 만드는가, 두 줄
착지 구간: #n — 축이 증명되는 자리 (마무리가 아니어도 된다)
예상 분량: n분 (재료 총량 기준 — 아래 분량 규칙)

역할표
- 근거 앵커: S? (축의 핵심 주장을 받치는 소스)
- 사례: S?, S? (청취자 일상 또는 구체 일화)
- 반론·한계: S?
- 수치·조사: S?
- 역사·맥락: S?  (없으면 "없음"이라고 쓰고 그 공백을 명시)
역할 없는 소스: S? — 제외 사유

구간 #1 — 소제목
  목적: 청취자에게 남길 것 한 줄
  재료: C01, C03 (S1) · C07 (S3)   ← 한 구간에 소스 2개 이상이 원칙. 한 소스만 쓰는 구간은 최대 1개. 사례·일화 재료는 구간당 하나만(예시 과다 방지)
  진행자 질문: 기원 서사가 붙은 질문 한 개 (왜 궁금해졌는지 한 조각 + 질문)
  전환 장치: 번역 맞장구로 닫기 | 인용구 던지기 | 되물음 | 딴 얘기 끼어들기 | 역질문 중 하나
  비율: n%
구간 #2 … (본문 구간 4~6개. 도입은 구간에 넣지 않는다 — [도입] 구역이 따로 맡는다. **한 소스의 재료가 본문의 1/3 을 넘지 않게**, 소스의 서술 순서를 그대로 구간 순서로 삼지 않는다 — 기사 순서가 구조가 되면 나열이 이해를 앞선다)

연결·비유 (대본이 만드는 것 — 사실이 아님, QA 대상 아님)
- "X를 Y로 옮김" — 근거 C##/C##, 어느 구간에서

마무리 한 줄: "무엇을 이해하게 됐나"
비율 합계: 도입 5~10 / 본문 75~85 / 마무리 10~15
\`\`\`
설계 규칙:
- 축은 반드시 대립("A인데 B"), 역설("A하려다 B가 된다"), 재정의("A는 사실 B다") 중 하나. "X란 무엇인가"형은 축이 아니다. 사건이 아니라 개념이 이끈다 (규칙 13-1).
- **소스 순회 금지**: 구간이 소스 단위로 나뉘면 실패다. 구간은 축의 논리 단계로 나누고, 각 단계에 여러 소스의 재료를 배치한다.
- 착지 구간을 반드시 지정하고, 그 구간의 재료가 실제로 축을 증명하는지 스스로 확인한다.
- 전환 장치는 구간마다 다르게 — 같은 장치 연속 금지. 청취자 일상 사례 왕복은 에피소드 전체에 최소 2회.
- **구간 소제목·진행자 질문·설계 메모에도 발췌 밖 수치·환산을 쓰지 않는다** — "1960년대"를 "60년 된"으로 바꾸는 식의 환산, 발췌에 없는 비교 축은 소제목에서도 QA 실패다.
- **분량 규칙** (2026-09-08 확정): 한 편은 **13분(공백·기호 제외 약 4,000자) 이상이 필수**, 15분이 평균 목표, 상한은 없다. 재료 총량으로 예상 분량을 적는다 — 이 숫자가 대본 단계의 목표가 되므로 실제 재료량대로 적는다(부풀리지 않는다). 재료가 13분에 못 미치면 구성안을 만들지 말고 notes 에 사유를 적는다(반려 대상). 26분 이상이면 각 편이 13분 이상이 되는 분할안을 split_proposal 에 적되, 구성안은 한 편 기준으로 그대로 만든다 (분할은 사람이 결정).
- 구성안의 재료(C##)는 전부 claims 에 있어야 한다.

### d) pronunciations — 대본에 등장할 모든 비한글 표기(영문 용어·인명·기관·매체) → 한글 발음. 없으면 빈 배열.

## 4. 소스 본문 (${i.sources.length}건 — 문단 ID 로 인용한다)
${srcBlocks}

## 5. 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. 완료 보고 전에 다른 텍스트를 출력하지 않는다.`;
}

const strArr = { type: "array", items: { type: "string" } } as const;
export const DESIGN_INLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["axis", "axis_type", "landing_section", "sections", "excerpt_ids", "gists", "claims", "outline_md", "pronunciations", "estimated_minutes", "split_proposal", "sources_used", "sources_excluded", "gaps", "notes"],
  properties: {
    axis: { type: "string" },
    axis_type: { type: "string", enum: ["대립", "역설", "재정의"] },
    landing_section: { type: "integer" },
    sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "title", "sources", "ratio"], properties: { n: { type: "integer" }, title: { type: "string" }, sources: strArr, ratio: { type: "integer" } } } },
    excerpt_ids: { ...strArr, description: "선택한 문단 ID (S1-03 …)" },
    gists: { type: "array", items: { type: "object", additionalProperties: false, required: ["s", "lines"], properties: { s: { type: "integer" }, lines: strArr } }, description: "소스별 한국어 요지 3줄" },
    claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "text", "excerpt_ids", "type", "attribution"], properties: { id: { type: "string" }, text: { type: "string" }, excerpt_ids: strArr, type: { type: "string", enum: ["수치", "인용", "고유명사", "인과", "정의", "실천"] }, attribution: { type: "string", enum: ["필수", "불필요"], description: "귀속 등급 (guidelines 규칙 20): 필수 = 직접 인용·수치·특정인 의견·논쟁적 주장 / 불필요 = 개념·원리·정의·널리 알려진 사실" } } } },
    outline_md: { type: "string", description: "outline.md 전문" },
    pronunciations: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string" }, reading: { type: "string" } } } },
    estimated_minutes: { type: "number" },
    split_proposal: { type: "string", description: "26분 이상일 때 분할안. 없으면 빈 문자열" },
    sources_used: strArr,
    sources_excluded: { type: "array", items: { type: "object", additionalProperties: false, required: ["url", "reason"], properties: { url: { type: "string" }, reason: { type: "string" } } } },
    gaps: { ...strArr, description: "비어 있는 역할" },
    notes: { type: "string" },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 수정 재생성 단발화 (2026-09-09 — 비용 절감): QA·L0 지적을 받은 대본을 에이전트 루프(Read·Edit·python) 대신 한 번의 호출로 고친다.
// 입력을 전부 인라인으로 넣고, 모델은 "바꿀 턴의 전문"만 돌려준다 — 파일 수정은 워커가 턴 단위로 치환한다.
// 첫 실편(T260909-002)에서 긴 턴 2개 고치는 데 에이전트 방식이 $1.92 였다. 토글 REVISION_MODE (기본 agent — 판정 3편이 끝날 때까지 현행 유지).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface RevisionInlineInput {
  episodeId: string;
  attempt: number;
  qaFailures: { location: string; item: string; reason: string }[];
  guidelines: string;
  scriptMd: string;
  claimsMd: string;
  sourcesMd: string;
  outlineMd?: string | null;
  pronunciationsJson: string;
}

export function buildRevisionPromptInline(i: RevisionInlineInput): string {
  const fence = (s: string) => "````\n" + s.trim() + "\n````";
  const failures = i.qaFailures.map((f, n) => `${n + 1}. [${f.location}] 항목 ${f.item}: ${f.reason}`).join("\n");
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 대본 작가다. QA(사실 무결성 검증) 또는 형식 검사(L0)가 실패한 대본을 **최소 수정**한다 (attempt ${i.attempt}/3).

이 실행에는 도구가 없다. 필요한 것은 전부 아래에 있다. 파일을 고치지 말고, **바꿀 턴의 전문만** 완료 보고로 돌려준다 — 워커가 그 턴을 통째로 갈아끼운다.

## 지적 사항 (전부 해소해야 한다)
${failures}

## 수정 원칙
- 지적된 턴만 고친다. 전면 재작성 금지 — 나머지 턴은 건드리지 않는다.
- **통계 용어를 대본에 쓰지 않는다** (guidelines 규칙 24, L0 가 잡는다): QA 지적문에 "통계적으로 유의하지 않다"·"매개"·"정적 관계" 같은 말이 있어도 대본에는 말로 옮긴다 — "차이가 뚜렷하지 않았다", "A 가 B 를 거쳐 C 로 이어졌다", "같이 움직였다". (T260909-009: QA 가 요구한 단서를 "통계적으로 유의하지 않았다"로 넣어 L0 에 다시 걸렸다)
- 수정은 발췌 안으로 들어오는 방향으로만: 발췌에 없는 수식·비교·방향·연대·위치 주장은 삭제하거나 발췌 문장 범위로 축소한다. 발췌를 새로 추가하지 않는다.
- 헤지·귀속 주체·세부(성별·관계·순서·위치·수량)는 발췌 수준으로 낮춘다 — 단정으로 올리거나 원저자 발언으로 바꾸거나 더 구체적으로 쓰지 않는다.
- 지시어 참조를 깨뜨리지 않는다: 삭제한 표현을 되받는 진행(Y) 턴·콜백("아까 그 ~", "같은 매체")이 있으면 그 턴도 함께 고친다(fixes 에 포함). 매체 지시가 바뀌면 재명명한다.
- 분량·턴 길이 지적(L0)이면: 해설 턴은 최대 6문장 — 문장을 합치거나 진행 턴의 되물음으로 나눈다. 분량 초과면 긴 턴의 풀어 쓰기를 줄인다(재료를 빼지 않는다).
- 구간 헤더(\`### #n\`)·구역 헤더·턴 번호 체계는 바꾸지 않는다. 턴을 지워야 하면 after 를 빈 문자열로 (연번은 워커가 유지한다 — 지운 번호는 비워 둔다).
- 같은 인용·문장을 다른 턴에서 이미 쓰고 있지 않은지 확인한다 (중복 낭독 금지).
- 수정으로 새 비한글 표기(영문 용어·인명)를 도입했으면 pronunciations_added 에 한글 발음을 적는다.

## 대본 규칙 (참조)
${fence(i.guidelines)}

## 대본 script.md (수정 대상 — 줄 문법: \`[윤아] E1 · 문장\` / \`[이음] Y1 · 문장\`)
${fence(i.scriptMd)}

## claims.md (쓸 수 있는 사실의 전부)
${fence(i.claimsMd)}

## sources.md (발췌 — 검증의 최종 기준)
${fence(i.sourcesMd)}
${i.outlineMd ? `\n## outline.md (구성안 — 구간 계약, 구조는 유지)\n${fence(i.outlineMd)}\n` : ""}
## pronunciations.json
${fence(i.pronunciationsJson)}

## 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. fixes 의 turn 은 "E12"·"Y7" 처럼 턴 번호, after 는 그 턴의 **발화 전문**(화자 라벨·번호·가운뎃점 없이 문장만). before 는 바꾸기 전 발화의 앞 30자. 완료 보고 전에 다른 텍스트를 출력하지 않는다.`;
}

export const REVISION_INLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fixes", "pronunciations_added", "claims_note", "notes"],
  properties: {
    fixes: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "before", "after", "why"], properties: { turn: { type: "string" }, before: { type: "string" }, after: { type: "string" }, why: { type: "string" } } } },
    pronunciations_added: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string" }, reading: { type: "string" } } } },
    claims_note: { type: "string", description: "claims.md 끝에 붙일 'QA 반영' 절 본문 — 어떤 주장이 어떻게 축소·삭제됐는지" },
    notes: { type: "string" },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 군집화 v2 (2026-09-09 — "축이 이끄는 파이프라인" ①, spec/03 2장 v2): 비슷한 것을 묶지 않고 **축을 먼저 세우고 역할을 채운다**.
// 축 = 대립("A인데 B") · 역설("A하려다 B가 된다") · 재정의("A는 사실 B다"). 소스 역할 5종. 다양성 기준(발행처 3+, 한 곳 ≤50%, 역할 3종)은 워커가 코드로 검사.
// 단발 호출(도구 없음): spec/03 의 필요한 절과 소스 메타데이터를 인라인으로 넣는다. 실험(CL, 2026-09-08): 8후보 중 5 성립, 발행처 쏠림 해소.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type SourceRole = "근거 앵커" | "사례" | "반론·한계" | "수치·조사" | "역사·맥락";
export const SOURCE_ROLES: SourceRole[] = ["근거 앵커", "사례", "반론·한계", "수치·조사", "역사·맥락"];

export interface ClusterV2Input {
  midTopics: string[];
  majorTopic?: string | null;
  nextIdNumber: number;
  sources: { n: number; url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null; midTopics?: string[]; used?: boolean }[];
  existingTitles: string[];
  /** spec/03 3장(후보 구성)·6장(게이트 1) 등 인라인으로 넣을 규격 발췌 */
  specBacklogExcerpt: string;
}

export function buildClusterPromptV2(i: ClusterV2Input): string {
  const list = i.sources.map((s) => `[M${s.n}] ${s.publisher || s.domain} · ${s.published ?? "날짜 미상"}${s.used ? " · (이미 사용된 소스)" : ""}\n   ${s.title}\n   ${(s.summary ?? "").replace(/\s+/g, " ").slice(0, 240)}`).join("\n");
  return `당신은 오디오 콘텐츠 서비스 "이어(ear)"의 **군집화 담당(v2)**이다. 스윕된 소스 **메타데이터만** 보고(원문 접속 금지 — 이 실행에는 도구가 없다) 에피소드 후보를 뽑는다. "비슷한 것을 묶는" 방식이 아니라, **축을 먼저 세우고 그 축에 필요한 역할을 소스로 채우는** 방식이다.

## 1. 타깃·중분류
- 청취자: 자기계발을 원하는 2030 한국 직장인(IT 개발자 아님), 편도 30분 통근.
- 중분류 후보: ${i.midTopics.join(" · ")}${i.majorTopic ? ` (대분류 ${i.majorTopic})` : ""}. 후보마다 하나를 고른다 — 소스의 커버 중분류를 참고하되 축에 맞는 것으로.

## 2. 규격 (spec/03 발췌)
${i.specBacklogExcerpt.trim()}

## 3. 군집화 v2 규칙

### 절차
1. **축 후보를 먼저 낸다.** 소스 목록 전체를 훑고, 청취자에게 긴장을 만드는 축을 여러 개 적는다. 축은 반드시 셋 중 하나의 꼴이다.
   - 대립형: "A인데 B" (예: 배제는 악의가 아니라 소속되고 싶은 마음에서 나온다)
   - 역설형: "A하려다 B가 된다" (예: 생각을 밀어낼수록 그 생각이 남는다)
   - 재정의형: "A는 사실 B다" (예: 집중력은 의지가 아니라 리듬이다)
   "X란 무엇인가", "X의 모든 것", 하나의 사건·발표·출시를 축으로 삼는 것은 축이 아니다 (이어는 소식을 전하는 서비스가 아니다 — 사건성 소스는 사례 재료로만).
2. **축마다 소스에 역할을 배정한다.** 역할은 다섯 가지 — 근거 앵커(축의 핵심 주장을 받치는 소스, 1~2건) · 사례(청취자 일상 또는 구체 일화) · 반론·한계 · 수치·조사 · 역사·맥락. 한 소스가 두 역할을 겸할 수 있다(roles 에 둘 다). 역할이 없는 소스는 넣지 않는다. 소스 수는 5~7건.
3. **다양성 기준**: 발행처 3곳 이상 · 한 발행처가 절반을 넘지 않음 · 역할 최소 3종(근거 앵커 + 사례 + 나머지 하나). "이미 사용된 소스"는 후보당 1건까지만. (워커가 코드로 다시 계산한다 — 맞추려고 소스를 억지로 끼우지 않는다.)
4. **판정**: 기준을 전부 만족하면 \`성립\`, 축은 좋은데 역할이 비면 \`보강 필요\`로 내고 비어 있는 역할을 gaps 에 적는다(다음 단계인 탐색 보강의 입력). 기준 미달을 억지로 채우지 않는다. 기존 후보 제목과 축이 겹치면 내지 않는다.

### 후보 항목 (완료 보고 JSON 의 candidates[])
- title(제목안, 클릭베이트 금지) · mid_topic · axis_type · axis(한 문장) · axis_note(왜 청취자에게 긴장인가, 두 줄) · verdict(성립|보강 필요) · gaps
- sources[]: { m: "M12", roles: ["근거 앵커"], why: "이 역할인 이유 한 줄" } — **M-ID 는 아래 목록에 있는 것만** (없는 ID 는 버려진다)
- target_fit(타깃 정합 한 줄) · landing(축이 어느 재료에서 증명될 것 같은가 한 줄) · dedup_note(기존 후보 제목과 겹치지 않는 이유 한 줄)
- 후보 ID 는 C${i.nextIdNumber} 부터 순번.

기존 후보 제목: ${i.existingTitles.length ? i.existingTitles.join(" / ") : "(없음)"}

## 4. 소스 메타데이터 (${i.sources.length}건)
${list}

## 5. 자기 점검 (출력 전에)
- 모든 후보의 축이 세 꼴 중 하나인가. "X란 무엇인가"형이 없는가.
- 성립 후보가 다양성 기준 세 가지를 전부 만족하는가 (발행처 수·최다 비율·역할 수를 직접 센다).
- 역할표의 M-ID 가 목록에 실제로 있는가. 근거 앵커가 1건 이상인가.

## 6. 완료 보고 — 반드시 요청된 JSON 스키마 형식으로만 출력한다. 성립 3~5개 + 보강 필요 0~4개를 목표로 하되 억지로 채우지 않는다. 완료 보고 전에 다른 텍스트를 출력하지 않는다.`;
}

export const CLUSTER_SCHEMA_V2 = {
  type: "object",
  additionalProperties: false,
  required: ["candidates", "axis_pool", "dropped_notes"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "mid_topic", "title", "axis_type", "axis", "axis_note", "verdict", "gaps", "sources", "target_fit", "landing", "dedup_note"],
        properties: {
          id: { type: "string" }, mid_topic: { type: "string" }, title: { type: "string" },
          axis_type: { type: "string", enum: ["대립", "역설", "재정의"] }, axis: { type: "string" }, axis_note: { type: "string" },
          verdict: { type: "string", enum: ["성립", "보강 필요"] },
          gaps: { type: "array", items: { type: "string", enum: ["근거 앵커", "사례", "반론·한계", "수치·조사", "역사·맥락"] } },
          sources: { type: "array", minItems: 3, items: { type: "object", additionalProperties: false, required: ["m", "roles", "why"], properties: { m: { type: "string" }, roles: { type: "array", minItems: 1, items: { type: "string", enum: ["근거 앵커", "사례", "반론·한계", "수치·조사", "역사·맥락"] } }, why: { type: "string" } } } },
          target_fit: { type: "string" }, landing: { type: "string" }, dedup_note: { type: "string" },
        },
      },
    },
    axis_pool: { type: "array", items: { type: "string" }, description: "검토했으나 후보로 내지 않은 축 (사유 포함)" },
    dropped_notes: { type: "array", items: { type: "string" } },
  },
} as const;
