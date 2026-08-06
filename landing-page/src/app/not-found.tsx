import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import s from "./not-found.module.css";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요",
  // 404는 색인 대상이 아니다.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main className={s.wrap}>
        <div className="container">
          <p className={s.code}>404</p>
          <h1 className={s.title}>찾으시는 페이지가 없어요</h1>
          <p className={s.lede}>
            주소가 바뀌었거나 삭제된 페이지일 수 있습니다. 첫 화면에서 다시
            찾아봐 주세요.
          </p>
          <Link href="/" className="btn btnPrimary">
            첫 화면으로
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
