import styles from './SourceNavigation.module.css';
import { useState } from 'react';

import { type CandleData } from "../../hooks/rawCandle/useCandleData";

export default function SourceNavigation(
    {candleData}: {candleData: CandleData}
) {

    const [symbolOpen, setSymbolOpen]       = useState(false)
    const [timeframeOpen, setTimeframeOpen] = useState(false)
    const [strateryOpen, setStrateryOpen]   = useState(false)


    return (
        <div className={styles.navigation}>

            {/* SYMBOL */}
            <div className={styles.buttonContainer} onMouseLeave={()=>setSymbolOpen(false)}>
                <div className={styles.button} onMouseEnter={()=>{setSymbolOpen(true)}}>
                    {candleData.getSymbol()}
                </div>
                {symbolOpen &&
                    <div className={styles.popupPanel}>
                        <div className={styles.popupItem} onClick={()=>candleData.setSrc("NAS100", candleData.getTimeframe())}>NAS100</div>
                        <div className={styles.popupItem} onClick={()=>candleData.setSrc("SP500", candleData.getTimeframe())}>SP500</div>
                    </div>
                }
            </div>

            <div className={styles.spliter}/>

            {/* TIMEFRAME */}
            <div className={styles.buttonContainer} onMouseLeave={()=>setTimeframeOpen(false)}>
                <div className={styles.button} onMouseEnter={()=>{setTimeframeOpen(true)}}>
                    {candleData.getTimeframe()}
                </div>                
                    {timeframeOpen &&
                        <div className={styles.popupPanel}>
                            <div className={styles.popupItem} onClick={()=>candleData.setSrc(candleData.getSymbol(), "1S")}>1S</div>
                            <div className={styles.popupItem} onClick={()=>candleData.setSrc(candleData.getSymbol(), "1M")}>1M</div>
                            <div className={styles.popupItem} onClick={()=>candleData.setSrc(candleData.getSymbol(), "15M")}>15M</div>
                            <div className={styles.popupItem} onClick={()=>candleData.setSrc(candleData.getSymbol(), "1H")}>1H</div>
                            <div className={styles.popupItem} onClick={()=>candleData.setSrc(candleData.getSymbol(), "1D")}>1D</div>
                            <div className={styles.popupItem} onClick={()=>candleData.setSrc(candleData.getSymbol(), "1MN")}>1MN</div>
                        </div>
                    }
            </div>


            <div className={styles.spliter}/>

            {/* STRATERY */}
            <div className={styles.buttonContainer} onMouseLeave={()=>setStrateryOpen(false)}>
                <div className={styles.button} onMouseEnter={()=>setStrateryOpen(true)}>
                    {"Stratery"}
                </div>                
                    {strateryOpen&&
                        <div className={styles.popupPanel}>
                            <div className={styles.popupItem}>Test 1</div>
                            <div className={styles.popupItem}>Test 2</div>
                            <div className={styles.popupItem}>Test 3</div>
                        </div>
                    }
            </div>

        </div>
    )
}