import { createContext, useContext, type ReactNode } from 'react';
import { useAccess } from '../hooks/useAccess';

type AccessState = ReturnType<typeof useAccess>;

const AccessContext = createContext<AccessState | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const access = useAccess();
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useAccessContext(): AccessState {
  const access = useContext(AccessContext);
  if (!access) throw new Error('useAccessContext must be used inside AccessProvider');
  return access;
}
