
export interface Strategy {
    name                : string;
    status              : string;
    createdTimestamp    : number;
}

export interface Algorithm {
    id               : number;
    name             : string;
    path             : string; // ext = ".py", ".exe"
    
    strategy         : string; // strategy name
    createdTimestamp : number;
    allowTrade       : boolean;
    config           : string; // string arg for CLI
}

export interface Trade {
    strategy        : string; // strategy name

    createrType     : string; // ["user", "algorithm"]
    createrId       : number; // createrType=="user" ? -1 : algorithm.id
    
    openTimestamp   : number;
    closeTimestamp  : number;
    matchTimestamp  : number;
    
    entry           : number; // Price
    stopLoss        : number; // Price
    takeProfit      : number; // Price
    
    pl              : number;
    volume          : number;
    fee             : number;
}

export interface Shape {
    id              : number;
    name            : string;
    type            : string;
    
    strategy        : string;
    createrType     : string; // ["user", "algorithm"]
    createrId       : number; // createrType=="user" ? -1 : algorithm.id
    
    startTimestamp  : number; 
    endTimestamp    : number;
    config          : object;
}
