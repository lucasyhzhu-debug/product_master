/**
 * Action Toast — Position-aware inline feedback
 *
 * Shows a lightweight floating feedback element near the clicked button.
 * This is especially important for Kitchen view where staff tap buttons
 * repeatedly on mobile and need instant visual confirmation.
 *
 * PATTERN:
 * - Use `actionToast()` for quick success confirmations (box, sticker, add balls)
 * - Use `toast.error()` from Sonner for errors (those should be prominent)
 *
 * Usage:
 *   import { actionToast } from '@/lib/actionToast';
 *
 *   const handleClick = async (e: React.MouseEvent) => {
 *     await doAction();
 *     actionToast('Boxed +5', e);
 *   };
 */

import { toast } from 'sonner';

export function actionToast(
  message: string,
  event?: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent
): void {
  // Fallback to Sonner if no event provided (programmatic calls)
  if (!event) {
    toast.success(message);
    return;
  }

  // Get the target element
  const target =
    'currentTarget' in event && event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : 'target' in event && event.target instanceof HTMLElement
        ? event.target
        : null;

  if (!target) {
    toast.success(message);
    return;
  }

  // Get button position
  const rect = target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const topY = rect.top;

  // Determine if we should show above or below
  // If button is near top (< 80px from top), show below
  const showBelow = topY < 80;
  const offsetY = showBelow ? rect.height + 12 : -40;

  // Create toast element
  const toastEl = document.createElement('div');
  toastEl.className = 'action-toast';
  toastEl.textContent = message;

  // Position the toast
  toastEl.style.position = 'fixed';
  toastEl.style.left = `${centerX}px`;
  toastEl.style.top = `${topY + offsetY}px`;
  toastEl.style.transform = 'translateX(-50%)';
  toastEl.style.zIndex = '9999';
  toastEl.style.pointerEvents = 'none';

  // Styling
  toastEl.style.background = 'rgba(0, 0, 0, 0.85)';
  toastEl.style.color = 'white';
  toastEl.style.padding = '6px 14px';
  toastEl.style.borderRadius = '999px';
  toastEl.style.fontSize = '14px';
  toastEl.style.fontWeight = '600';
  toastEl.style.whiteSpace = 'nowrap';
  toastEl.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';

  // Animation
  toastEl.style.animation = 'action-toast-in 0.15s ease-out, action-toast-out 0.2s ease-in 1.0s forwards';

  // Add to DOM
  document.body.appendChild(toastEl);

  // Remove after animation completes
  setTimeout(() => {
    if (toastEl.parentNode) {
      toastEl.parentNode.removeChild(toastEl);
    }
  }, 1200);
}
