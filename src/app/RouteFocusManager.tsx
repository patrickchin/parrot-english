import { useEffect } from "react";
import { useLocation } from "react-router";

function hasLocalFocusLifecycle(pathname: string) {
  return pathname.includes("/scenes/") || pathname.includes("/pages/");
}

export function RouteFocusManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (hasLocalFocusLifecycle(pathname)) return;

    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector("main h1");
      if (!(heading instanceof HTMLElement)) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
