// Global DM state — currently just the total unread count so the Community
// tab header badge can subscribe without prop-drilling. Kept intentionally
// small; the inbox and conversation screens own their own list/pagination
// state locally.

import { create } from 'zustand';
import { getDmUnreadCount } from './api';

interface MessagesState {
  unreadCount: number;
  isRefreshing: boolean;
  setUnread: (n: number) => void;
  incrementUnread: (by?: number) => void;
  clearUnread: () => void;
  refresh: () => Promise<void>;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  unreadCount: 0,
  isRefreshing: false,
  setUnread: (n) => set({ unreadCount: Math.max(0, n) }),
  incrementUnread: (by = 1) => set({ unreadCount: Math.max(0, get().unreadCount + by) }),
  clearUnread: () => set({ unreadCount: 0 }),
  refresh: async () => {
    if (get().isRefreshing) return;
    set({ isRefreshing: true });
    try {
      const n = await getDmUnreadCount();
      set({ unreadCount: n });
    } catch {
      // Non-fatal. Leaves the last known count in place.
    } finally {
      set({ isRefreshing: false });
    }
  },
}));
