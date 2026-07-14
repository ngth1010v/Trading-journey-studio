import React, { createContext, useEffect, useState, useRef, useCallback } from "react";
import type { Theme, PartialTheme, ThemeDataContextType } from "./type";
import { themeApi } from "./themeApi";

export const ThemeDataContext = createContext<ThemeDataContextType | null>(null);

export const ThemeDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themes, setThemes] = useState<Theme[]>([]);
  const listenersRef = useRef<Map<string, (theme: Theme) => void>>(new Map());

  // Load initial themes from backend API
  useEffect(() => {
    themeApi.getAllThemes()
      .then((data) => setThemes(data))
      .catch((err) => console.error("Failed to fetch themes initially:", err));
  }, []);

  const getSelectedName = useCallback((): string => {
    const selected = themes.find((t) => t.selected);
    return selected ? selected.name : "Default";
  }, [themes]);

  const get = useCallback((themeName: string): Theme | undefined => {
    return themes.find((t) => t.name === themeName);
  }, [themes]);

  const getAll = useCallback((): Theme[] => {
    return themes;
  }, [themes]);

  const set = useCallback(async (themeName: string, partialTheme: PartialTheme): Promise<void> => {
    try {
      const updatedTheme = await themeApi.saveTheme(themeName, partialTheme);

      setThemes((prevThemes) => {
        let updatedList = prevThemes.map((t) => {
          if (t.name === themeName) return updatedTheme;
          // Turn off selection flags globally if this update toggled a theme to selected
          if (updatedTheme.selected && t.name !== themeName) {
            return { ...t, selected: false };
          }
          return t;
        });

        const exists = prevThemes.some((t) => t.name === themeName);
        if (!exists) {
          if (updatedTheme.selected) {
            updatedList = updatedList.map((t) => ({ ...t, selected: false }));
          }
          updatedList.push(updatedTheme);
        }

        // Trigger reactive subscriber callbacks exclusively when selected theme context switches
        if (updatedTheme.selected) {
          listenersRef.current.forEach((callback) => callback(updatedTheme));
        }

        return updatedList;
      });
    } catch (error) {
      console.error(`Failed to update theme data for '${themeName}':`, error);
      throw error;
    }
  }, []);

  const addOnSelectedThemeChange = useCallback((id: string, callback: (theme: Theme) => void) => {
    listenersRef.current.set(id, callback);
  }, []);

  const removeOnSelectedThemeChange = useCallback((id: string) => {
    listenersRef.current.delete(id);
  }, []);

  const contextValue: ThemeDataContextType = {
    getSelectedName,
    get,
    getAll,
    set,
    addOnSelectedThemeChange,
    removeOnSelectedThemeChange,
  };

  return (
    <ThemeDataContext.Provider value={contextValue}>
      {children}
    </ThemeDataContext.Provider>
  );
};