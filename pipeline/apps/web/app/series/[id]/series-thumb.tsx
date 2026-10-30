"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PUBLICATION_STYLES, publicationOf, publicationsFor, type Publication, type PublicationStyle } from "@ear/pipeline/publication";
import type { PipelineLocale } from "@/lib/locale";
import { btnCls, Panel } from "@/components/ui";
import { patchEarSeries, uploadPipelineSeriesCover } from "@/lib/ear";
import { earErrMsg } from "@/app/publish/ear-connect";
import { createPublication, saveSeriesThumb } from "../actions";

const inp = "w-full rounded border border-line px-2 py-1 text-[12.5px] outline-none focus:border-brand";

/**
 * 간행물 · 시리즈 썸네일 (2026-10-20 KAN-136 · 2026-10-26 KAN-247) — 간행물이 발행 이름(앱 시리즈 화면 제목 아래 줄, "○○의 다른 시리즈" 묶음)과 편 썸네일 디자인을 한 번에 정한다.
 * 키워드 시리즈 디자인(keyword 스타일): 시리즈의 모든 편이 같은 그림에 번호만 다르다(레퍼런스 "이어 · KEYWORD SERIES · keyword · 경제편 · 01").
 * 바탕(아이콘 셋)은 이미지 모델이 시리즈당 한 번 그리고, 로고·라벨·큰 단어(손글씨 폰트)·박스·번호·표지 편수는 코드가 얹는다.
 * 이미 발행된 시리즈(productSeriesId)는 간행물을 바꾸면 서버의 발행 이름도 같이 바꾼다(PATCH /admin/series/:id publisher_name).
 */
export function SeriesThumb({ id, locale, publication: p0, word: w0, label: l0, box: b0, hasBase, productSeriesId, publications, layers: ly0 = "" }: { id: string; locale: PipelineLocale; publication: string | null; word: string; label: string; box: string; hasBase: boolean; productSeriesId: string | null; publications: Publication[]; layers?: string }) {
  const router = useRouter();
  const [publication, setPublication] = useState(p0 ?? "");
  const [word, setWord] = useState(w0);
  const [label, setLabel] = useState(l0);
  const [box, setBox] = useState(b0);
  const [layers, setLayers] = useState(ly0);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [pending, start] = useTransition();
  const options = publicationsFor(locale, publications);
  const pub = publicationOf(publication || null, publications);
  const [creating, setCreating] = useState(false);
  const [np, setNp] = useState<{ name: string; style: PublicationStyle; hint: string }>({ name: "", style: "scene", hint: "" });
  const keyword = pub?.style === "keyword";
  const phrasebook = pub?.style === "phrasebook";
  const coded = pub?.style === "tv" || pub?.style === "notes" || pub?.style === "layers" || pub?.style === "wave"; // 코드 합성(2026-10-28·29) — 글자 칸은 라벨(+층)만 쓴다
  const layered = pub?.style === "layers";
  const drawn = keyword || phrasebook || coded; // 편 썸네일·표지를 워커가 그리는 디자인
  const dirty = publication !== (p0 ?? "") || word !== w0 || label !== l0 || box !== b0 || layers !== ly0;
  const save = (regenerate: boolean, redraw = false) => start(async () => {
    const r = await saveSeriesThumb(id, { publication: publication || null, word, label, box, layers }, regenerate, redraw);
    if (!r.ok) { setMsg({ text: r.reason, bad: true }); return; }
    let text = regenerate ? `저장 · 편 썸네일 ${r.queued}개 다시 만들기 작업을 걸었다${redraw ? " — 바탕 그림을 새로 그린다(이미지 1장)" : " — 바탕은 그대로, 글자만 다시 얹는다"}` : "저장";
    // 발행된 시리즈 — 서버의 발행 이름도 맞춘다. 실패해도 파이프라인 저장은 유지되고, 아래 "제품 시리즈" 표에서 다시 바꿀 수 있다
    if (productSeriesId && publication !== (p0 ?? "")) {
      try { await patchEarSeries(productSeriesId, { publisher_name: pub?.name ?? null }); text += ` · 제품 시리즈 발행 이름 → ${pub?.name ?? "없음"}`; }
      catch (e) { setMsg({ text: `${text} · 제품 시리즈 발행 이름 갱신 실패: ${earErrMsg(e)} — /series 아래 제품 시리즈 표에서 바꾼다`, bad: true }); router.refresh(); return; }
    }
    setMsg({ text, bad: false });
    router.refresh();
  });
  return (
    <Panel title="간행물 · 시리즈 썸네일" right={<span className="text-[11px] text-ink-soft">{keyword ? (hasBase ? "바탕 그림 있음 — 편마다 번호만 얹는다" : "바탕 그림 없음 — 첫 편 썸네일이 그린다") : "편마다 일반 장면 썸네일"}</span>}>
      <div className="space-y-2 text-[13px]">
        <div className="grid gap-2 md:grid-cols-[14rem_1fr]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-soft">간행물 (발행 이름)</span>
            <select className={inp} value={publication} onChange={(e) => setPublication(e.target.value)}>
              <option value="">없음 — 발행 이름 없이, 장면 썸네일</option>
              {options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
            </select>
          </label>
          <p className="self-end pb-1 text-[11px] text-ink-soft">
            {pub ? <>앱 시리즈 화면 제목 아래에 <b>{pub.name}</b>이 나가고, 같은 간행물의 시리즈끼리 &quot;{pub.name}의 다른 시리즈&quot;로 묶인다. {pub.hint}.</> : "발행 이름이 없으면 앱은 그 줄을 생략하고 다른 시리즈와 묶지 않는다."}
            {" "}<button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => setCreating((c) => !c)}>{creating ? "새 간행물 닫기" : "+ 새 간행물"}</button>
          </p>
        </div>
        {creating && (
          <div className="rounded border border-line bg-panel p-3">
            <div className="grid gap-2 md:grid-cols-[14rem_14rem_1fr]">
              <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">이름 (앱에 그대로 나간다)</span><input className={inp} value={np.name} maxLength={24} placeholder={locale === "en" ? "e.g. Field Notes" : "예: 탑다운"} onChange={(e) => setNp({ ...np, name: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">썸네일 디자인</span>
                <select className={inp} value={np.style} onChange={(e) => setNp({ ...np, style: e.target.value as PublicationStyle })}>
                  {PUBLICATION_STYLES.map((s) => <option key={s.style} value={s.style}>{s.label}</option>)}
                </select>
              </label>
              <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">설명 (콘솔 선택지에만)</span><input className={inp} value={np.hint} maxLength={80} placeholder="어떤 형식의 시리즈를 담나" onChange={(e) => setNp({ ...np, hint: e.target.value })} /></label>
            </div>
            <p className="mt-2 text-[11px] text-ink-soft">{PUBLICATION_STYLES.find((s) => s.style === np.style)?.desc}. 이름은 주제가 아니라 형식을 가리키게 짓는다 — 다른 주제의 시리즈도 담을 수 있게. 디자인은 워커에 있는 셋 중 하나만 고를 수 있고, 새 디자인은 코드로 더한다.</p>
            <div className="mt-2 flex items-center gap-2">
              <button className={btnCls("primary")} disabled={pending || np.name.trim().length < 2} onClick={() => start(async () => {
                const r = await createPublication(np);
                if (!r.ok) { setMsg({ text: r.reason, bad: true }); return; }
                setPublication(r.key); setCreating(false); setMsg({ text: `간행물 "${np.name.trim()}" 을 만들었다 — [저장]으로 이 시리즈에 적용`, bad: false }); router.refresh();
              })}>간행물 만들기</button>
              <span className="text-[11px] text-ink-soft">만든 뒤 이 시리즈에 바로 선택된다. 아래 [저장]을 눌러야 적용된다.</span>
            </div>
          </div>
        )}
        {coded && (
          <div className="grid gap-2 md:grid-cols-3">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">오른쪽 위 라벨 (비면 {pub?.style === "tv" ? "AD SERIES" : pub?.style === "notes" ? "CASE SERIES" : pub?.style === "wave" ? "NETWORK" : "TOP-DOWN SERIES"})</span><input className={inp} value={label} maxLength={24} onChange={(e) => setLabel(e.target.value)} /></label>
            {layered && <label className="block md:col-span-2"><span className="mb-1 block text-xs font-semibold text-ink-soft">층 — 이름:시작-끝 을 쉼표로 (2~6개, 1화부터 마지막 화까지 빈틈 없이)</span><input className={inp} value={layers} placeholder="연결:1-6, 처리:7-9, 데이터:10-18, 운영:19-26" onChange={(e) => setLayers(e.target.value)} /></label>}
          </div>
        )}
        {(keyword || phrasebook) && (
          <div className="grid gap-2 md:grid-cols-3">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">{phrasebook ? "표지 손글씨 (영문 — 비면 annyeong)" : "큰 단어 (영문 — 손글씨 폰트로 얹는다)"}</span><input className={inp} value={word} maxLength={16} onChange={(e) => setWord(e.target.value)} placeholder={phrasebook ? "annyeong" : "keyword"} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">{phrasebook ? "오른쪽 위 라벨 (비면 PHRASEBOOK SERIES)" : "오른쪽 위 라벨"}</span><input className={inp} value={label} maxLength={24} onChange={(e) => setLabel(e.target.value)} placeholder={phrasebook ? "PHRASEBOOK SERIES" : "KEYWORD SERIES"} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">{phrasebook ? "책 머리글 (뒤에 KOREAN 이 붙는다)" : "왼쪽 아래 박스"}</span><input className={inp} value={box} maxLength={12} onChange={(e) => setBox(e.target.value)} placeholder={phrasebook ? "K-Drama" : "경제편"} /></label>
          </div>
        )}
        <p className="text-[11px] text-ink-soft">
          {keyword
            ? <>키워드 시리즈 디자인 — 편 썸네일(왼쪽 아래 번호 01·02…)과 표지(라벨 아래 편수)를 같은 바탕에 만든다. 큰 단어가 비어 있으면 편 썸네일 작업이 실패한다.</>
            : phrasebook
              ? <>회화집 디자인 — 작은 책 표지에 그 편의 표현(로마자·한글)과 뜻을 쓰고 책갈피 리본에 번호를 단다. 이미지 모델 없이 코드가 그려 편마다 결과가 같고 비용이 없다. 한글 표기는 썸네일 작업 때 텍스트 모델이 제목을 보고 써 준다.</>
              : coded
                ? <>{pub?.style === "tv" ? "TV 정지 화면 — 어두운 바탕의 옛 TV 화면에 설계안의 편 제목을 쓰고 채널 번호에 편 번호를 단다." : pub?.style === "notes" ? "포스트잇 벽 — 노랑(설계안 편 제목)·분홍(번호)·민트(시리즈명) 메모지 세 장." : pub?.style === "wave" ? "파형 그래프 — 인디고 바탕의 오실로스코프에 편마다 채널(파형) 하나, 이번 편 채널만 밝게. 아래에 CH 번호와 설계안 편 제목." : "계층 쌓기 — 층을 세로로 쌓고 이번 편이 속한 층만 밝게, 그 안에 설계안 편 제목."} 이미지·텍스트 모델 없이 코드가 그려 비용이 없고 편마다 결과가 같다. 표지는 제목 자리에 시리즈 이름, 번호 자리에 편수.</>
              : <>{pub ? `${pub.name} 전용 썸네일 디자인은 아직 워커에 없다 — ` : ""}편 썸네일은 일반 편과 같은 장면 썸네일이다. 디자인이 생기면 간행물에 스타일로 붙인다(spec/11 7장).</>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnCls()} disabled={pending || !dirty} onClick={() => save(false)}>저장</button>
          {drawn && <button className={btnCls("primary")} disabled={pending} onClick={() => { if (confirm(phrasebook || coded ? "이 시리즈에서 썸네일이 있는 편을 전부 다시 만들까요?\n책 표지를 코드로 다시 그린다(이미지 생성 없음, 한글 표기만 텍스트 모델)." : "이 시리즈에서 썸네일이 있는 편을 전부 다시 만들까요?\n바탕은 그대로 두고 글자만 다시 얹는다(이미지 생성 없음).")) save(true); }}>저장하고 편 썸네일 다시 만들기</button>}
          {keyword && <button className={btnCls()} disabled={pending} onClick={() => { if (confirm("바탕 그림(아이콘 셋)을 새로 그리고 편 썸네일을 전부 다시 만들까요? 이미지 1장을 새로 만든다.")) save(true, true); }}>바탕 그림도 새로 그리기</button>}
          {productSeriesId && drawn && (
            <button className={btnCls()} disabled={pending} title="파이프라인이 만든 표지(thumb-cover.png)를 제품 시리즈 표지로 올린다 — 표지가 없으면 앱이 1화 썸네일을 쓴다"
              onClick={() => { if (confirm("파이프라인 표지를 제품 시리즈 표지로 올릴까요? 탐색 시리즈 카드와 시리즈 화면에 바로 반영됩니다.")) start(async () => {
                try { const c = await uploadPipelineSeriesCover(id, productSeriesId); setMsg(c ? { text: "표지를 서버에 올렸다", bad: false } : { text: "표지 파일이 없다 — 편 썸네일을 다시 만든 뒤 다시 시도", bad: true }); }
                catch (e) { setMsg({ text: `표지 업로드 실패: ${earErrMsg(e)}`, bad: true }); }
              }); }}>표지 서버에 올리기</button>
          )}
          {msg && <span className={`text-[12px] ${msg.bad ? "text-rose-700" : "text-emerald-700"}`}>{msg.text}</span>}
        </div>
      </div>
    </Panel>
  );
}
