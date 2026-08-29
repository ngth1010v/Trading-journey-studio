import PageElementConfigData from "../../../../../data/pageElement/config/PageElementConfigData.js";
import type { Viewport } from "../viewport/ViewportData";
import type { RGBA, RGB } from "../../../../../shared/type";

const REFLUSH_DURATION = 1000;

export interface Config {
  viewport?: Viewport;
  symbol?: string;
  timeframe?: string;
  strategyId?: number | null;
  sync?: {
    linkId?: number | null;
    viewport?: {
      enable?: boolean;
      extend?: {
        top: number;
        bottom: number;
        left: number;
        right: number;
      };
      style?: {
        background?: RGBA;
        border?: {
          color?: RGBA;
          thickness?: number;
          type?: "dash" | "solid";
          dash?: {
            space: number; //px
            width: number; //px
          };
        };
      };
    };
    crosshair?: {
      enable?: boolean;
      style?: {
        color?: {
          background?: RGBA;
          font?: RGB;
        };
        thickness?: number;
        type?: "dash" | "solid";
        dash?: {
          space: number; //px
          width: number; //px
        };
      };
    };
  };
  style?: {
    crosshair?: {
      color?: {
        background?: RGBA;
        font?: RGB;
      };
      thickness?: number;
      type?: "dash" | "solid";
      dash?: {
        space: number; //px
        width: number; //px
      };
    };
    altCrosshair?: {
      color?: {
        background?: RGBA;
        font?: RGB;
      };
      thickness?: number;
      type?: "dash" | "solid";
      dash?: {
        space: number; //px
        width: number; //px
      };
    };
    candle?: {
      opening?: {
        color?: {
          background: RGBA;
          font?: RGB;
        };
        thickness?: number;
        type?: "dash" | "solid";
        dash?: {
          space: number; //px
          width: number; //px
        };
      };
      bull?: {
        background?: RGBA;
        border?: RGBA;
      };
      bear?: {
        background?: RGBA;
        border?: RGBA;
      };
    };
    shappeEditor?: {
      size?: number
      color?: RGBA,
      border?:{
        thickness?: number
        color?: RGBA
      }
    }
  };
  floatingBar?: {
    seasonBar?: {
      enable?: boolean;
      position?: {
        x?: number;
        y?: number;
      };
    };
  };
}

export default class ConfigData {
  private pageElementConfigData: PageElementConfigData<Config> = new PageElementConfigData<Config>();
  private isChanged: boolean = false;
  private reflushIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Initializes the configuration for the specified page element ID.
   * Merges default configuration values, triggers initial remote sync via PageElementConfigData,
   * and starts the reflush loop.
   */
  public init(pageElementId: number): void {
    const defaultConfig: Config = {
      viewport: {
        fromTs: Date.now() - ((1000 * 60 * 60 * 24 * 5) * 3) / 4,
        toTs: Date.now() + (1000 * 60 * 60 * 24) / 4,
        fromPrice: 0,
        toPrice: 1,
      } as Viewport,
      timeframe: "1H",
      sync: {
        viewport: {
          enable: true,
          extend: {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
          },
          style: {
            background: [255, 255, 0, 20] as RGBA,
            border: {
              color: [255, 255, 0, 255] as RGBA,
              thickness: 1,
              type: "dash",
              dash: {
                space: 5, //px
                width: 10, //px
              },
            },
          },
        },
        crosshair: {
          enable: true,
          style: {
            color: {
              background: [255, 255, 100, 255] as RGBA,
              font: [0, 0, 0] as RGB,
            },
            thickness: 1,
            type: "dash",
            dash: {
              space: 5, //px
              width: 5, //px
            },
          },
        },
      },
      style: {
        crosshair: {
          color: {
            background: [255, 255, 255, 255] as RGBA,
            font: [0, 0, 0] as RGB,
          },
          thickness: 1,
          type: "dash",
          dash: {
            space: 5, //px
            width: 5, //px
          },
        },
        altCrosshair: {
          color: {
            background: [255, 255, 200, 100] as RGBA,
            font: [0, 0, 0] as RGB,
          },
          thickness: 1,
          type: "dash",
          dash: {
            space: 5, //px
            width: 5, //px
          },
        },
        candle: {
          opening: {
            color: {
              background: [248, 249, 250, 255] as RGBA,
              font: [0, 0, 0] as RGB,
            },
            thickness: 1,
            type: "dash",
            dash: {
              space: 3, //px
              width: 5, //px
            },
          },
          bull: {
            background: [50, 255, 50, 255] as RGBA,
            border: [50, 255, 50, 255] as RGBA,
          },
          bear: {
            background: [255, 50, 50, 255] as RGBA,
            border: [255, 50, 50, 255] as RGBA,
          },
        },
        shappeEditor: {
          size: 20,
          color: [10,10,20,255] as RGBA,
          border:{
            thickness: 1,
            color: [255,255,255,255] as RGBA
          }
        }
      },
      floatingBar: {
        seasonBar: {
          enable: false,
          position: {
            x: 30,
            y: 30,
          },
        },
      },
    };

    if (
      defaultConfig.viewport &&
      (defaultConfig.viewport.fromPrice == null || defaultConfig.viewport.toPrice == null)
    ) {
      defaultConfig.viewport.fromPrice = 0;
      defaultConfig.viewport.toPrice = 1;
    }

    this.pageElementConfigData.init(pageElementId, defaultConfig);

    if (this.reflushIntervalId === null) {
      this.reflushIntervalId = setInterval(() => {
        if (this.isChanged) {
          this.flush();
        }
      }, REFLUSH_DURATION);
    }
  }

  /**
   * Destroys the underlying instance, stops the reflush loop, and flushes cache state if necessary.
   */
  public destroy(): void {
    if (this.reflushIntervalId !== null) {
      clearInterval(this.reflushIntervalId);
      this.reflushIntervalId = null;
    }

    this.pageElementConfigData.destroy();
  }

  /**
   * Returns cached Config data.
   */
  public get(): Config | null {
    return this.pageElementConfigData.get();
  }

  /**
   * Updates partial config, marks state as changed, and triggers changes locally/server-side.
   */
  public set(partialConfig: Partial<Config>): void {
    if (
      partialConfig.viewport &&
      (partialConfig.viewport.fromPrice == null || partialConfig.viewport.toPrice == null)
    ) {
      partialConfig.viewport.fromPrice = 0;
      partialConfig.viewport.toPrice = 1;
    }

    this.isChanged = true;
    this.pageElementConfigData.set(partialConfig);
  }

  /**
   * Flushes current cached config changes to the server manually and resets change flag.
   */
  public async flush(): Promise<void> {
    this.isChanged = false;
    await this.pageElementConfigData.flush();
  }

  /**
   * Registers a callback listener on configuration changes.
   */
  public addOnConfigDataChange(id: string, target: string[], cb: () => void): void {
    this.pageElementConfigData.addOnPageElementConfigDataChange(id, target, cb);
  }

  /**
   * Removes a callback listener by ID.
   */
  public removeOnConfigDataChange(id: string): void {
    this.pageElementConfigData.removeOnPageElementConfigDataChange(id);
  }
}