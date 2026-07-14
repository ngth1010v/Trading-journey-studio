import React, { createContext, useEffect, useState, useRef, useCallback } from "react";
import type { Theme, PartialTheme, ThemeDataContextType } from "./type";
import { themeApi } from "./themeApi";

export const ThemeDataContext = createContext<ThemeDataContextType | null>(null);

export const ThemeDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themes, setThemes] = useState<Theme[]>([]);
  const listenersRef = useRef<Map<string, (theme: Theme) => void>>(new Map());
  const globalListenersRef = useRef<Map<string, (changedNames: string[]) => void>>(new Map());
  
  // Tracks the timestamp for pulling historical differential changes
  const trackingTimestampRef = useRef<number>(Date.now());

  // Load initial themes from backend API
  useEffect(() => {
    themeApi.getAllThemes()
      .then((data) => {
        setThemes(data)
        const newSelected = data.find((t) => t.selected);
        if (newSelected) listenersRef.current.forEach((callback) => callback(newSelected));
      })
      .catch((err) => console.error("Failed to fetch themes initially:", err));
  }, []);

  // Polling hook every 1 second to inspect structural backend edits
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const queryTime = trackingTimestampRef.current;
        const changedNames = await themeApi.getChangedThemes(queryTime);

        if (changedNames.length > 0) {
          // Progressively increment track pointer reference
          trackingTimestampRef.current = Date.now();

          // Fetch full fresh content payloads
          const updatedThemes = await themeApi.getAllThemes();

          setThemes((prevThemes) => {
            const oldSelected = prevThemes.find((t) => t.selected);
            const oldSelectedName = oldSelected ? oldSelected.name : "Default";

            const newSelected = updatedThemes.find((t) => t.selected);
            const newSelectedName = newSelected ? newSelected.name : "Default";

            // Trigger when selection target name changed OR the existing target name properties were changed
            const selectedThemeChanged = oldSelectedName !== newSelectedName || changedNames.includes(newSelectedName);

            if (selectedThemeChanged && newSelected) {
              listenersRef.current.forEach((callback) => callback(newSelected));
            }

            return updatedThemes;
          });

          // Always broadcast changes to general structural hook subscribers
          globalListenersRef.current.forEach((callback) => callback(changedNames));
        }
      } catch (err) {
        console.error("Error occurred during theme change synchronization polling:", err);
      }
    }, 1000);

    return () => clearInterval(interval);
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

  const addOnThemeDataChange = useCallback((id: string, callback: (changedNames: string[]) => void) => {
    globalListenersRef.current.set(id, callback);
  }, []);

  const removeOnThemeDataChange = useCallback((id: string) => {
    globalListenersRef.current.delete(id);
  }, []);

  const contextValue: ThemeDataContextType = {
    getSelectedName,
    get,
    getAll,
    set,
    addOnSelectedThemeChange,
    removeOnSelectedThemeChange,
    addOnThemeDataChange,
    removeOnThemeDataChange,
  };

  return (
    <ThemeDataContext.Provider value={contextValue}>
      {children}
    </ThemeDataContext.Provider>
  );
};