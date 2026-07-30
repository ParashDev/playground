import { useCallback, useEffect, useState } from "react";
import App from "./app/App";
import Landing from "./landing/Landing";

type View = "landing" | "playground";

/**
 * Single-page shell. The landing and the playground are two views of the same
 * URL — nothing here navigates, so opening the editor never changes the address
 * bar and the page keeps one canonical URL for search engines.
 *
 * Every load starts on the landing. That is the page people arrive on from
 * search, so it is what a visit has to show.
 */
export default function Root() {
  const [view, setView] = useState<View>("landing");

  const open = useCallback(() => {
    window.scrollTo(0, 0);
    setView("playground");
  }, []);

  const home = useCallback(() => {
    window.scrollTo(0, 0);
    setView("landing");
  }, []);

  // The landing scrolls; the playground is a fixed full-height layout.
  useEffect(() => {
    document.body.dataset.view = view;
    document.documentElement.style.overflow = view === "playground" ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [view]);

  if (view === "playground") return <App onHome={home} />;
  return <Landing onOpen={open} />;
}
