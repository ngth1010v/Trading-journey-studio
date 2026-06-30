import { useContext } from 'react';
import { PopupContext } from './PopupProvider';
import type { PopupContextType } from './PopupProvider';

export const usePopup = (): PopupContextType => {
  const context = useContext(PopupContext);
  
  if (!context) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  
  return context;
};