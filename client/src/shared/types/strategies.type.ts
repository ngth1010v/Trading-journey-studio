export interface Strategy {
  name              : string; // primary key
  tagNames          : string[]; // in database, tagNames is saved as json
  createdTimestamp  : number;
  desc              : string;
  favoriteSymbols   : string[];
  favoriteTimeframes: string[];
  themeColor        : [number, number, number][]; // in database, themeColor is saved as json
}

export interface StrategyTag {
  name            : string; // primary key
  createdTimestamp: number;
  desc            : string;
  themeColor      : [number, number, number][]; // in database, themeColor is saved as json
}