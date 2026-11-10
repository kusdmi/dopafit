import { create } from 'zustand';

/**
 * Ephemeral navigation state for the workout summary screen.
 *
 * The summary is a one-shot, terminal screen sitting on top of a deep
 * «Программы» tab stack. Each tab's stack is preserved across tab switches
 * and the StackManager unmounts/remounts the page when the tab is re-entered —
 * so component-local state (useState/useRef) does not survive to tell us
 * "these итоги were already shown and left". We need an external store.
 *
 * Once the user navigates away from a session's summary by any means (button,
 * tab-bar switch, link, swipe-back), that summary is "consumed": the next time
 * the «Программы» tab is entered while these итоги are still its top entry, it
 * must reset to the programs list instead of re-showing the summary. A freshly
 * finished workout has a new session id, so its summary is not yet consumed and
 * still shows normally.
 *
 * Only the *last* consumed session id is tracked, not a growing set. The summary
 * lives on a single tab stack and is terminal, so at most one summary can be the
 * left-but-not-yet-reset top entry at a time — a single string is sufficient and
 * leak-free (no unbounded growth, no stale entries). The marker is also cleared
 * once consumed so it can never linger or fire twice.
 *
 * This store is intentionally NOT persisted: it is transient UI navigation state
 * that should not survive a reload.
 */
interface ConsumedSummaryState {
  /** Session id of the summary that has been shown and left, pending tab reset. */
  lastConsumedSessionId: string | null;
  /** Mark a session's summary as shown-and-left. */
  markConsumed: (sessionId: string) => void;
  /** Whether this session's summary has been consumed (left and not yet reset). */
  isConsumed: (sessionId: string) => boolean;
  /** Clear the marker after the tab reset has been applied. */
  clear: () => void;
}

export const useConsumedSummaryStore = create<ConsumedSummaryState>((set, get) => ({
  lastConsumedSessionId: null,
  markConsumed: (sessionId) => set({ lastConsumedSessionId: sessionId }),
  isConsumed: (sessionId) => get().lastConsumedSessionId === sessionId,
  clear: () => set({ lastConsumedSessionId: null }),
}));
