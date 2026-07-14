import { useContext } from "react";
import { ThemeDataContext } from "./ThemeDataProvider";
import type { ThemeDataContextType } from "./type";

export function useThemeData(): ThemeDataContextType {
  const context = useContext(ThemeDataContext);
  if (!context) {
    throw new Error("useThemeData must be wrapped within a functional <ThemeDataProvider />");
  }
  return context;
}