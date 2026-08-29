import { Navigate } from "@solidjs/router";
import type { JSX } from "solid-js";

export default function MobileGuard(props: { children: JSX.Element }) {
  if (isMobileDevice()) {
    return <Navigate href="/unsupported-device" />;
  }
  return <>{props.children}</>;
}

export function isMobileDevice(): boolean {
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const smallViewport = window.innerWidth < 768;
  return uaMobile || smallViewport;
}
