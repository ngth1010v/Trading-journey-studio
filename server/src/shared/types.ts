

// ==============================================================================================
//  MARKET
// ==============================================================================================
export interface Tick {
    timestamp   : Date;
    bid         : number;
    ask         : number;
    volume      : number;
}

export interface Ohlc {
    openTimestamp   : Date;
    open            : number;
    high            : number;
    low             : number;
    close           : number;
    volume          : number;
}

export interface SymbolData {
    symbol  : string;
    point   : number;
}



// ==============================================================================================
//  
// ==============================================================================================