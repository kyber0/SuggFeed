"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// We omit the specific generic type from next-themes for simplicity since we know we just pass props
export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
