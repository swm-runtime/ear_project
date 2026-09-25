import ExpoModulesCore
import UIKit

/**
 iOS 26 의 `UIScrollView.topEdgeEffect`(scroll edge effect — 상태 바·바 밑에서 콘텐츠가 밑으로 들어올 때 나타나는
 점진 블러)를 RN 스크롤 뷰(RCTScrollView 안의 UIScrollView)에 **직접** 건다.

 react-native-screens 도 같은 API 를 쓰지만 스택 화면 마운트 시점에 `subviews[0]` 을 따라 첫 스크롤 뷰를 한 번만
 찾아, 탭 바 컨트롤러 밑의 늦게 마운트되는 목록엔 닿지 않았다(2026-09-25 실기기). JS 로 만든 블러 띠·마스크는
 계단·얼룩으로 폐기했다. 애플 공개 API 하나로 끝내는 가장 짧은 길이 이 모듈이다.

 결과는 문자열로 돌려준다 — 실기기에서 어느 단계가 막혔는지 설정 > 디버그 행에서 읽는다(20:41 "16인데 안 됨").
 */
public class ScrollEdgeEffectModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScrollEdgeEffect")

    // style: "automatic" | "soft" | "hard" | "hidden"
    // 반환: "applied:<class>" | "unavailable"(iOS 26 미만) | "no-view" | "no-scrollview:<class>"
    AsyncFunction("apply") { (viewTag: Int, style: String) -> String in
      guard #available(iOS 26.0, *) else { return "unavailable" }
      guard let host = self.appContext?.findView(withTag: viewTag, ofType: UIView.self) else { return "no-view" }
      guard let scrollView = Self.findScrollView(in: host) else {
        return "no-scrollview:\(String(describing: type(of: host)))"
      }
      switch style {
      case "soft":
        scrollView.topEdgeEffect.style = .soft
        scrollView.topEdgeEffect.isHidden = false
      case "hard":
        scrollView.topEdgeEffect.style = .hard
        scrollView.topEdgeEffect.isHidden = false
      case "hidden":
        scrollView.topEdgeEffect.isHidden = true
      default:
        scrollView.topEdgeEffect.style = .automatic
        scrollView.topEdgeEffect.isHidden = false
      }
      let inset = scrollView.adjustedContentInset.top
      return "applied:\(String(describing: type(of: scrollView))) inset=\(Int(inset)) hidden=\(scrollView.topEdgeEffect.isHidden)"
    }.runOnQueue(.main)
  }

  /// RCTScrollView(UIView) 는 실제 UIScrollView 를 자식으로 품는다 — 첫 UIScrollView 자손을 찾는다
  private static func findScrollView(in view: UIView) -> UIScrollView? {
    if let scrollView = view as? UIScrollView { return scrollView }
    for subview in view.subviews {
      if let found = findScrollView(in: subview) { return found }
    }
    return nil
  }
}
