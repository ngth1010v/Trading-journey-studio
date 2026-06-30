import { useState } from 'react';
import styles from './SourceNavigation.module.css';

import { type CandleData } from "../../hooks/rawCandle/useCandleData";

export default function SourceNavigation(
    {candleData}: {candleData: CandleData}
) {


    return (
        <div className={styles.navigation}>

            {/* SYMBOL */}
            <div className={styles.button}>
                {candleData.getSymbol()}
                <div className={styles.popupPanel}>
                    <div className={styles.popupItem} onClick={()=>candleData.setSrc("NAS100", candleData.getTimeframe())}>NAS100</div>
                    <div className={styles.popupItem} onClick={()=>candleData.setSrc("SP500", candleData.getTimeframe())}>SP500</div>
                </div>
            </div>

            <div className={styles.spliter}/>

            {/* TIMEFRAME */}
            <div className={styles.button}>
                {candleData.getTimeframe()}
                <div className={styles.popupPanel}>
                    <div className={styles.popupItem} onClick={()=>candleData.setSrc(candleData.getSymbol(), "1S")}>1S</div>
                    <div className={styles.popupItem} onClick={()=>candleData.setSrc(candleData.getSymbol(), "1M")}>1M</div>
                    <div className={styles.popupItem} onClick={()=>candleData.setSrc(candleData.getSymbol(), "15M")}>15M</div>
                    <div className={styles.popupItem} onClick={()=>candleData.setSrc(candleData.getSymbol(), "1H")}>1H</div>
                </div>
            </div>
        </div>
    )
}