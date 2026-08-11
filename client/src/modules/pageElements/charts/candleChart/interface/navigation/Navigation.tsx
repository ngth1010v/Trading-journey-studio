import { useState, useEffect, useId, useRef } from 'react';
import styles from './Navigation.module.css';

import StateData from '../../state/StateData'; // Adjust path to StateData as needed
import ThemeData, { type Theme } from '../../../../../data/theme/ThemeData';
import type { RGB, RGBA } from '../../../../../shared/type';

import SourceBar from './source/SourceBar';
import StrategyBar from './strategy/StrategyBar';
import SyncBar from './sync/SyncBar';

import HouseIcon      from '../../../../../../assets/icons/house-simple.svg?react';
import SourceIcon     from '../../../../../../assets/icons/git-branch.svg?react';
import SyncIcon       from '../../../../../../assets/icons/arrows-left-right.svg?react';
import DrawIcon       from '../../../../../../assets/icons/pencil.svg?react';
import CalculatorIcon from '../../../../../../assets/icons/calculator.svg?react';
import StrategyIcon   from '../../../../../../assets/icons/book.svg?react';

const toRGBString = (color: RGB) =>
  `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const toRGBAString = (color: RGBA) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;

export default function Navigation({ state }: { state: StateData }) {
  const instanceId = useId();

  // Create ThemeData instance inside Navigation
  const themeDataRef = useRef<ThemeData | null>(null);
  if (!themeDataRef.current) {
    themeDataRef.current = new ThemeData();
  }

  const [currentTheme, setCurrentTheme] = useState<Theme | undefined>(() =>
    themeDataRef.current?.getSelected()
  );

  // Home toggle state for expanding/collapsing height of the panel
  const [isHomeExpanded, setIsHomeExpanded] = useState<boolean>(true);
  const [openChildren, setOpenChildren] = useState<boolean[]>([false, false, false, false, false]);

  const toggleChild = (index: number) => {
    setOpenChildren((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const toggleHome = () => {
    setIsHomeExpanded((prev) => !prev);
  };

  // Initialize ThemeData and listen to updates
  useEffect(() => {
    const themeData = themeDataRef.current;
    if (!themeData) return;

    const handleThemeChange = () => {
      setCurrentTheme(themeData.getSelected());
    };

    // Initialize ThemeData background sync
    themeData.init()

    // Subscribe to both full theme changes and selected theme changes
    themeData.addOnThemeDataChange(instanceId, handleThemeChange);
    themeData.addOnSelectedThemeDataChange(instanceId, handleThemeChange);

    return () => {
      themeData.removeOnThemeDataChange(instanceId);
      themeData.removeOnSelectedThemeDataChange(instanceId);
      themeData.destroy();
    };
  }, [instanceId]);

  const buttonTheme = currentTheme?.button?.normal1;
  const activeTheme = currentTheme?.button?.primary1;
  const hoverTheme = currentTheme?.button?.primary2;

  const inlineStyle: React.CSSProperties & { [key: string]: string } = buttonTheme
    ? {
        '--bg-color': toRGBAString(buttonTheme.background),
        '--border-color': toRGBAString(buttonTheme.border),
        '--font-color': toRGBString(buttonTheme.font),
        '--hover-bg': toRGBAString(hoverTheme?.background ?? buttonTheme.background),
        '--hover-font': toRGBString(hoverTheme?.font ?? buttonTheme.font),
        '--active-bg': toRGBAString(activeTheme?.background ?? buttonTheme.background),
        '--active-border': toRGBAString(activeTheme?.border ?? buttonTheme.border),
        '--active-font': toRGBString(activeTheme?.font ?? buttonTheme.font),
      }
    : {
        '--bg-color': 'rgba(22, 22, 24, 1)',
        '--border-color': 'rgb(50, 50, 50)',
        '--font-color': '#ffffff',
        '--hover-bg': 'rgba(40, 40, 45, 1)',
        '--hover-font': '#ffffff',
        '--active-bg': 'rgba(50, 100, 200, 1)',
        '--active-border': '#2563eb',
        '--active-font': '#ffffff',
      };

  return (
    <div className={styles.navigation} style={inlineStyle}>
      {/* Main Panel containing Home toggle + 4 bar toggle buttons */}
      <div className={`${styles.mainPanel} ${isHomeExpanded ? styles.expanded : styles.collapsed}`}>
        {/* Home Toggle Button */}
        <button
          type="button"
          className={styles.homeButton}
          title="Toggle Navigation Height"
          onClick={toggleHome}
        >
          <HouseIcon width="12" height="12" />
        </button>

          <button
            type="button"
            className={`${styles.toggleButton} ${openChildren[0] ? styles.toggleButtonActive : ''}`}
            title="Source"
            onClick={() => toggleChild(0)}
          >
            <SourceIcon width="12" height="12" />
          </button>

          <button
            type="button"
            className={`${styles.toggleButton} ${openChildren[1] ? styles.toggleButtonActive : ''}`}
            title="Strategy"
            onClick={() => toggleChild(1)}
          >
            <StrategyIcon width="12" height="12" />
          </button>

          <button
            type="button"
            className={`${styles.toggleButton} ${openChildren[2] ? styles.toggleButtonActive : ''}`}
            title="Sync"
            onClick={() => toggleChild(2)}
          >
            <SyncIcon width="12" height="12" />
          </button>

          <button
            type="button"
            className={`${styles.toggleButton} ${openChildren[3] ? styles.toggleButtonActive : ''}`}
            title="Shape"
            onClick={() => toggleChild(3)}
          >
            <DrawIcon width="12" height="12" />
          </button>

          <button
            type="button"
            className={`${styles.toggleButton} ${openChildren[4] ? styles.toggleButtonActive : ''}`}
            title="Replay"
            onClick={() => toggleChild(4)}
          >
            <CalculatorIcon width="12" height="12" />
          </button>
      </div>

      {/* Active sub-bars content container */}
      <div className={styles.childrenContainer}>
        {/* 1. SOURCE BAR */}
        {openChildren[0] && (
          <div className={styles.childWrapper}>
            <SourceBar state={state} />
          </div>
        )}

        {/* 1. STRATEGY BAR */}
        {openChildren[1] && (
          <div className={styles.childWrapper}>
            <StrategyBar state={state} />
          </div>
        )}

        {/* 2. SYNC BAR */}
        {openChildren[2] && (
          <div className={styles.childWrapper}>
            <SyncBar state={state}/>
          </div>
        )}

        {/* 3. SHAPE BAR PLACEHOLDER */}
        {openChildren[3] && (
          <div className={styles.childWrapper}>
            <div className={styles.placeholderBox}>ShapeBar (Coming Soon)</div>
          </div>
        )}

        {/* 4. REPLAY BAR PLACEHOLDER */}
        {openChildren[4] && (
          <div className={styles.childWrapper}>
            <div className={styles.placeholderBox}>ReplayBar (Coming Soon)</div>
          </div>
        )}
      </div>
    </div>
  );
}