import { useState } from 'react';
import styles from './Navigation.module.css';

import { type CandleData }   from '../market/hooks/useCandleData';
import { type StrateryData } from '../market/hooks/useStrateryData';

import ButtonWithPopover from '../../../../../shared/components/ButtonWithPopover';

import SourceBar from './sourceBar/SourceBar';

import HouseIcon      from '../../../../../assets/icons/house-simple.svg?react';
import SourceIcon     from '../../../../../assets/icons/git-branch.svg?react';
import SyncIcon       from '../../../../../assets/icons/arrows-clockwise.svg?react';
import DrawIcon       from '../../../../../assets/icons/pencil.svg?react';
import CalculatorIcon from '../../../../../assets/icons/calculator.svg?react';

export default function Navigation(
  {
    candleData,
    strateryData,
    onMouseEnter,
    onMouseLeave
  }: {
    candleData: CandleData
    strateryData: StrateryData
    onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>)=> void
    onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>)=> void
  }
) {
  // Quản lý trạng thái mở riêng biệt cho các nội dung con (Index: 0, 1, 2, 3)
  const [openChildren, setOpenChildren] = useState<boolean[]>([false, false, false, false]);

  const toggleChild = (index: number) => {
    setOpenChildren((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  return (
    <div className={styles.navigation} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {/* Nút Toggle Panel chính sử dụng ButtonWithPopover hiển thị dạng hover */}
      <ButtonWithPopover
        type="hover"
        position="bottom"
        align="center"
        button={
          <div className={styles.toggleButton} title="Toggle Navigation Panel">
            <HouseIcon width="15" height="15"/>
          </div>
        }
        popup={
          <div className={styles.togglePanel}>
            <button
              type="button"
              className={`${styles.toggleButton} ${openChildren[0] ? styles.toggleButtonActive : ''}`}
              title="Source"
              onClick={() => toggleChild(0)}
            >
              <SourceIcon width="15" height="15"/>
            </button>

            <button
              type="button"
              className={`${styles.toggleButton} ${openChildren[1] ? styles.toggleButtonActive : ''}`}
              title="Sync"
              onClick={() => toggleChild(1)}
            >
              <SyncIcon width="15" height="15"/>
            </button>

            <button
              type="button"
              className={`${styles.toggleButton} ${openChildren[2] ? styles.toggleButtonActive : ''}`}
              title="Draw"
              onClick={() => toggleChild(2)}
            >
              <DrawIcon width="15" height="15"/>
            </button>

            <button
              type="button"
              className={`${styles.toggleButton} ${openChildren[3] ? styles.toggleButtonActive : ''}`}
              title="Algothym"
              onClick={() => toggleChild(3)}
            >
              <CalculatorIcon width="15" height="15"/>
            </button>
          </div>
        }
      />

      {/* Vùng hiển thị nội dung tương ứng khi bấm button */}
      <div className={styles.childrenContainer}>
        {/* SOURCE */}
        {openChildren[0] && (
          <div className={styles.childWrapper}>
            <SourceBar candleData={candleData} strateryData={strateryData}/>
          </div>
        )}

        {/* SYNC */}
        {openChildren[1] && (
          <div className={styles.childWrapper}>
            <div>This is a test 2</div>
          </div>
        )}

        {/* DRAW */}
        {openChildren[2] && (
          <div className={styles.childWrapper}>
            <div>This is a test 3</div>
          </div>
        )}

        {/* DRAW */}
        {openChildren[3] && (
          <div className={styles.childWrapper}>
            <div>This is a test 4</div>
          </div>
        )}
      </div>
    </div>
  );
}