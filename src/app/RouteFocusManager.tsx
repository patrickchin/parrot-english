import { useEffect } from "react";
import { useLocation } from "react-router";

function hasLocalFocusLifecycle(pathname: string) {
  return pathname.includes("/scenes/") || pathname.includes("/pages/");
}

export function RouteFocusManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (hasLocalFocusLifecycle(pathname)) return;

    const activeElement = document.activeElement;
    if (activeElement !== document.body) return;

    const heading = document.querySelector("main h1");
    const routeMain = heading?.closest("main");
    const frame = window.requestAnimationFrame(() => {
      if (
        document.activeElement !== activeElement ||
        !(heading instanceof HTMLElement) ||
        !heading.isConnected ||
        heading.closest("main") !== routeMain ||
        document.querySelector("main") !== routeMain
      ) {
        return;
      }
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
