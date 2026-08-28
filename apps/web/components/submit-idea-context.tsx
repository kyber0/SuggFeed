"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface SubmitIdeaContextType {
  isOpen: boolean;
  openSubmitPanel: () => void;
  closeSubmitPanel: () => void;
}

const SubmitIdeaContext = createContext<SubmitIdeaContextType | undefined>(undefined);

export function SubmitIdeaProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <SubmitIdeaContext.Provider
      value={{
        isOpen,
        openSubmitPanel: () => setIsOpen(true),
        closeSubmitPanel: () => setIsOpen(false),
      }}
    >
      {children}
    </SubmitIdeaContext.Provider>
  );
}

export function useSubmitIdea() {
  const context = useContext(SubmitIdeaContext);
  if (context === undefined) {
    throw new Error("useSubmitIdea must be used within a SubmitIdeaProvider");
  }
  return context;
}
