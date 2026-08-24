import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function focusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.closest("[hidden], [inert], [aria-hidden='true']") &&
      element.tabIndex >= 0,
  );
}

export function useDialogFocus({
  canClose = () => true,
  dialogRef,
  initialFocusRef,
  onClose,
  returnFocusRef,
}: {
  canClose?: () => boolean;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const canCloseRef = useRef(canClose);
  const onCloseRef = useRef(onClose);
  canCloseRef.current = canClose;
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    initialFocusRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!canCloseRef.current()) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const currentIndex = focusable.indexOf(
        document.activeElement as HTMLElement,
      );
      const movingBeforeFirst = event.shiftKey && currentIndex <= 0;
      const movingPastLast =
        !event.shiftKey && currentIndex === focusable.length - 1;
      const focusOutsideDialog = currentIndex === -1;
      if (!movingBeforeFirst && !movingPastLast && !focusOutsideDialog) return;

      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const returnTarget = returnFocusRef?.current ?? previouslyFocused;
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [dialogRef, initialFocusRef, returnFocusRef]);
}
