import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal accessibility for the Group Buy dialogs: when `open` flips true it
 * remembers the trigger, moves focus into the dialog, and traps Tab within it;
 * Escape calls `onClose`; on close it restores focus to the trigger. Attach the
 * returned ref to the dialog container element.
 */
export function useDialogA11y<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const containerRef = useRef<T>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Capture the trigger and focus the first control on open; restore focus on close.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    const first = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      triggerRef.current?.focus?.();
    };
  }, [open]);

  // Escape to close + Tab focus trap. Kept separate so a changing onClose identity
  // never re-runs the focus-management effect above.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return containerRef;
}
