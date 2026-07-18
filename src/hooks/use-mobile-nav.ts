import { create } from "zustand";

interface MobileNavState {
  isMobileDrawerOpen: boolean;
  setMobileDrawerOpen: (open: boolean) => void;
}

export const useMobileNav = create<MobileNavState>((set) => ({
  isMobileDrawerOpen: false,
  setMobileDrawerOpen: (open) => set({ isMobileDrawerOpen: open }),
}));
