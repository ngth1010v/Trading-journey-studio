import React, { createContext, useState } from 'react';
import type { ReactNode } from 'react';

// Define the shape of a single popup layer
export interface PopupLayer {
  id: string;
  component: ReactNode;
}

// Define the context value type
export interface PopupContextType {
  layers: PopupLayer[];
  add: (id: string, component: ReactNode) => void;
  remove: (id: string) => void;
  clean: () => void;
}

// Create the context
export const PopupContext = createContext<PopupContextType | undefined>(undefined);

interface PopupProviderProps {
  children: ReactNode;
}

export const PopupProvider: React.FC<PopupProviderProps> = ({ children }) => {
  const [layers, setLayers] = useState<PopupLayer[]>([]);

  const add = (id: string, component: ReactNode) => {
    setLayers((prevLayers) => {
      if (prevLayers.some((layer) => layer.id === id)) {
        throw new Error(`Popup with id "${id}" already exists.`);
      }
      return [...prevLayers, { id, component }];
    });
  };

  const remove = (id: string) => {
    setLayers((prevLayers) => {
      if (!prevLayers.some((layer) => layer.id === id)) {
        throw new Error(`Popup with id "${id}" does not exist.`);
      }
      return prevLayers.filter((layer) => layer.id !== id);
    });
  };

  const clean = () => {
    setLayers([]);
  };

  return (
    <PopupContext.Provider value={{ layers, add, remove, clean }}>
      {children}
      {/* Render components directly into the provider from left to right */}
      {layers.map((layer) => (
        <React.Fragment key={layer.id}>
          {layer.component}
        </React.Fragment>
      ))}
    </PopupContext.Provider>
  );
};