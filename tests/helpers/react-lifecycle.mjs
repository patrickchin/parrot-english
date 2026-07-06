import { Window } from "happy-dom";
import { StrictMode, act, createElement } from "react";

const mountedRoots = new Set();

export function deferred() {
  let reject;
  let resolve;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

export function installDom() {
  const browserWindow = new Window({ url: "http://localhost/" });
  const bindings = {
    CustomEvent: browserWindow.CustomEvent,
    DOMException: browserWindow.DOMException,
    Element: browserWindow.Element,
    Event: browserWindow.Event,
    HTMLElement: browserWindow.HTMLElement,
    HTMLInputElement: browserWindow.HTMLInputElement,
    HTMLTextAreaElement: browserWindow.HTMLTextAreaElement,
    KeyboardEvent: browserWindow.KeyboardEvent,
    MouseEvent: browserWindow.MouseEvent,
    MutationObserver: browserWindow.MutationObserver,
    Node: browserWindow.Node,
    PointerEvent: browserWindow.PointerEvent,
    SVGElement: browserWindow.SVGElement,
    cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
    document: browserWindow.document,
    getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
    location: browserWindow.location,
    navigator: browserWindow.navigator,
    requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
    window: browserWindow,
  };
  const previousDescriptors = new Map(
    Object.keys(bindings).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );

  for (const [key, value] of Object.entries(bindings)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  return () => {
    browserWindow.happyDOM.cancelAsync();
    for (const [key, descriptor] of previousDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  };
}

export async function mountStrict(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.add(root);

  await act(async () => {
    root.render(createElement(StrictMode, null, element));
  });

  return container;
}

export async function cleanupMountedRoots() {
  const roots = [...mountedRoots];
  mountedRoots.clear();
  for (const root of roots) {
    await act(async () => root.unmount());
  }
}

export async function click(element) {
  if (!(element instanceof HTMLElement)) {
    throw new TypeError("click() requires a mounted HTML element.");
  }
  await act(async () => element.click());
}

export async function input(element, value) {
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement)
  ) {
    throw new TypeError("input() requires a mounted input or textarea.");
  }
  const prototype =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("The DOM input value setter is unavailable.");

  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}

export async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export async function waitFor(assertion, { attempts = 100 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return assertion();
    } catch (error) {
      lastError = error;
      await flush();
    }
  }
  throw lastError;
}

export function textContent(root = document.body) {
  return root.textContent;
}
