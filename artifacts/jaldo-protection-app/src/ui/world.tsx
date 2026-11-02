import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { ProtectionWorld } from "../sim/session";

const defaultWorld = new ProtectionWorld();
const WorldContext = createContext<ProtectionWorld>(defaultWorld);

export const WorldProvider = ({ world, children }: { world?: ProtectionWorld; children: ReactNode }) => <WorldContext.Provider value={world ?? defaultWorld}>{children}</WorldContext.Provider>;

/** The fictional world, re-read whenever the kernel-backed session changes. */
export function useWorld(): ProtectionWorld {
  const w = useContext(WorldContext);
  useSyncExternalStore(w.subscribe, w.getVersion, w.getVersion);
  return w;
}
