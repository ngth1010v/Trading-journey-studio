import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import type { LinkState } from "../../../state/sync/link/state/LinkStateData";

const BASE_ID = "[chart][viewport][ViewportSync]";

export default class LinkStateController {
    private state: StateData | null = null;
    private chart: ChartController | null = null;

    private lastSyncDownTimestamp = {
        global: 0,
        viewport: 0,
        transform: 0,
        crosshair: 0
    };

    // Granular Dirty Flags
    private isSymbolDirty: boolean = true;
    private isViewportDirty: boolean = true;
    private isTransformDirty: boolean = true;
    private isCrosshairDirty: boolean = true;

    // Cache Min/Max candle prices & dirty flag
    private isCandleDirty: boolean = true;
    private cachedHighestPrice: number | null = null;
    private cachedLowestPrice: number | null = null;

    // RAF Batching
    private rafId: number | null = null;

    public init(state: StateData, chart: ChartController): void {
        this.state = state;
        this.chart = chart;
        
        // Global
        this.state.config.addOnConfigDataChange( BASE_ID + "viewportSyncId sync up", ["viewportSyncId"], this.onViewportDataChange );
        this.state.config.addOnConfigDataChange( BASE_ID + "symbol sync up", ["symbol"], this.onSymbolDataChange );
       
        // Viewport
        this.state.config.addOnConfigDataChange( BASE_ID + "viewport sync up", ["viewport"], this.onViewportDataChange );
        this.state.source.candle.addOnClosedCandleDataChange( BASE_ID + "closedCandle sync up", this.onCandleDataChange );
        this.state.source.candle.addOnOpeningCandleDataChange( BASE_ID + "openingCandle sync up", this.onCandleDataChange );
        
        // Transform
        this.state.viewport.addOnViewportTransformDataChange(BASE_ID + "transform sync up", this.onTransformDataChange);

        // Crosshair
        this.state.crosshair.addOnCrosshairDataChange( BASE_ID + "crosshair sync up", this.onCrosshairDataChange );
        
        // Mouse leave
        this.chart.event.addOnEvent( "mouseLeave", BASE_ID + "on mouse leave", this.onMouseLeave );

        // Sync down
        this.state.sync.link.state.addOnLinkStateDataChange( BASE_ID + "sync down", this.syncDown );
    }

    public destroy(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        if (this.state) {
            this.state.viewport.removeOnViewportTransformDataChange(BASE_ID + "transform sync up");
            this.state.crosshair.removeOnCrosshairDataChange(BASE_ID + "crosshair sync up");
            this.state.config.removeOnConfigDataChange(BASE_ID + "viewportSyncId sync up");
            this.state.config.removeOnConfigDataChange(BASE_ID + "viewport sync up");
            this.state.config.removeOnConfigDataChange(BASE_ID + "symbol sync up");
            this.state.source.candle.removeOnClosedCandleDataChange(BASE_ID + "closedCandle sync up");
            this.state.source.candle.removeOnOpeningCandleDataChange(BASE_ID + "openingCandle sync up");
            this.state.sync.link.state.removeOnLinkStateDataChange(BASE_ID + "sync down");
        }

        if (this.chart) {
            this.chart.event.removeOnEvent(BASE_ID + "on mouse leave");
        }

        this.state = null;
        this.chart = null;
    }

    private onSymbolDataChange = (): void => {
        this.isSymbolDirty = true;
        this.scheduleSyncUp();
    }

    private onViewportDataChange = (): void => {
        this.isViewportDirty = true;
        this.scheduleSyncUp();
    }

    private onTransformDataChange = (): void => {
        this.isTransformDirty = true;
        this.scheduleSyncUp();
    }

    private onCrosshairDataChange = (): void => {
        this.isCrosshairDirty = true;
        this.scheduleSyncUp();
    }

    private onCandleDataChange = (): void => {
        this.isCandleDirty = true;
        this.isViewportDirty = true; // Viewport depends on candles for calc bounds
        // this.scheduleSyncUp();
    };

    private scheduleSyncUp = (): void => {
        if (this.rafId !== null) return;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.syncUp();
        });
    };

    private onMouseLeave = (): void => {
        this.state?.crosshair.setAlt(null);
        const state = this.state?.sync.link.state.get();
        if (!state) return;
        state.modifyTimestamp.crosshair = Date.now();
        state.crosshair = null;
        this.state?.sync.link.state.set(state);
    };

    private calcCandleMinMax = () : void => {
        if (this.isCandleDirty || this.cachedHighestPrice === null || this.cachedLowestPrice === null) {
            const binCandle = this.state?.source.candle.getAllClosed();
            if (!binCandle) return;
            const view = this.state?.config.get()?.viewport
            if (!view) return;

            const { h, l, t } = binCandle;
            const len = h.length;

            let highestPrice = -Infinity;
            let lowestPrice = Infinity;

            for (let i = 0; i < len; i++) {
                if (h[i] == l[i] && h[i] == 0) continue
                if (t[i] < view.fromTs || view.toTs < t[i]) continue
                if (h[i] > highestPrice) highestPrice = h[i];
                if (l[i] < lowestPrice) lowestPrice = l[i];
            }

            const openingCandle = this.state?.source.candle.getOpening();
            if (openingCandle && (openingCandle.h != 0 && openingCandle.l != 0)) {
                if (openingCandle.h > highestPrice) highestPrice = openingCandle.h;
                if (openingCandle.l < lowestPrice) lowestPrice = openingCandle.l;
            }

            if (highestPrice === -Infinity || lowestPrice === Infinity) {
                return;
            }

            this.cachedHighestPrice = highestPrice;
            this.cachedLowestPrice = lowestPrice;
            this.isCandleDirty = false;
        }        
    }

    private syncUp = (): void => {
        if (this.state?.sync.link.state.getRegistriedLinkId() == null) return
        const mode = this.state?.sync.link.getMode();
        if (!mode || mode === "down") return;

        this.calcCandleMinMax();

        const canvasSize = this.chart?.event.getCanvasSize();
        if (!canvasSize || canvasSize.h === 0) return

        const oldState = this.state?.sync.link.state.get();
        const now = Date.now();

        const newTimestamp = oldState?.modifyTimestamp 
            ? { ...oldState.modifyTimestamp } 
            : { global: 0, viewport: 0, transform: 0, crosshair: 0 };

        let currentSymbol = oldState?.symbol ?? "";
        let newViewportState = oldState?.viewport ?? null;
        let newTransformState = oldState?.transform ?? null;
        let newCrosshairState = oldState?.crosshair ?? null;

        // Global / Symbol
        if (this.isSymbolDirty) {
            const configSymbol = this.state?.config.get()?.symbol;
            if (configSymbol) {
                currentSymbol = configSymbol;
                newTimestamp.global = now;
            }
            this.isSymbolDirty = false;
        }

        // Crosshair
        if (this.isCrosshairDirty) {
            let calculatedCrosshair = null;
            while(true) {
                const crosshairPixel = this.state?.crosshair.getPixel();
                if (!crosshairPixel) break

                const crosshairTime = this.chart?.viewport.converter.pixelToTimestamp(crosshairPixel.x);
                const crosshairPrice = this.chart?.viewport.converter.pixelToPrice(crosshairPixel.y);
                const priceOffsetRatio = crosshairPixel.y / canvasSize.h
                if (crosshairTime == null || crosshairPrice == null) break;

                calculatedCrosshair = {
                    price: crosshairPrice,
                    timestamp: crosshairTime,
                    alt: {
                        priceOffsetRatio: priceOffsetRatio    
                    }
                }
                break;
            }
            newCrosshairState = calculatedCrosshair;
            newTimestamp.crosshair = now;
            this.isCrosshairDirty = false;
        }

        // Viewport
        if (this.isViewportDirty) {
            let calculatedViewport = null;
            while(true) {
                const viewport = this.state?.config.get()?.viewport;
                if (!viewport) break
                
                if (!this.cachedHighestPrice || !this.cachedLowestPrice) break
                const highestPricePixel = this.chart?.viewport.converter.priceToPixel(this.cachedHighestPrice);
                const lowestPricePixel = this.chart?.viewport.converter.priceToPixel(this.cachedLowestPrice);
                if (highestPricePixel == null || lowestPricePixel == null) break
                
              
                const priceDeltaRatio = Math.abs(lowestPricePixel - highestPricePixel) / canvasSize.h
                const priceOffsetRatio = highestPricePixel / canvasSize.h

                calculatedViewport = {
                    fromTs: viewport.fromTs,
                    toTs: viewport.toTs,
                    fromPrice: viewport.fromPrice,
                    toPrice: viewport.toPrice,
                    alt: {  
                        priceDeltaRatio: priceDeltaRatio,
                        priceOffsetRatio: priceOffsetRatio,      
                    }
                }
                break;
            }
            newViewportState = calculatedViewport;
            newTimestamp.viewport = now;
            this.isViewportDirty = false;
        }

        // Transform
        if (this.isTransformDirty) {
            let calculatedTransform = null;
            while(true) {
                const transform = this.state?.viewport.getTransform()
                if (!transform) break

                calculatedTransform = {
                    scaleX: transform.scaleX,
                    scaleY: transform.scaleY,
                    offsetX: transform.offsetX,
                    offsetY: transform.offsetY
                }
                break;
            }
            newTransformState = calculatedTransform;
            newTimestamp.transform = now;
            this.isTransformDirty = false;
        }

        const newState: LinkState = {
            modifyTimestamp: newTimestamp,
            symbol: currentSymbol,
            viewport: newViewportState,
            crosshair: newCrosshairState,
            transform: newTransformState
        };
        this.state?.sync.link.state.set(newState);
    };

    private syncDown = (): void => {
        if (this.state?.sync.link.state.getRegistriedLinkId() == null) return
        const mode = this.state?.sync.link.getMode();
        if (!mode || mode === "up") return;

        this.calcCandleMinMax()

        const linkState = this.state?.sync.link.state.get();
        if (!linkState || !linkState.modifyTimestamp) return;

        const currentSymbol = this.state?.config.get()?.symbol;
        if (!currentSymbol) return;
        const currentCanvasSize = this.chart?.event.getCanvasSize();
        if (!currentCanvasSize || currentCanvasSize.h == 0) return;

        const crosshairChanged = linkState.modifyTimestamp.crosshair > this.lastSyncDownTimestamp.crosshair
        const transformChanged = linkState.modifyTimestamp.transform > this.lastSyncDownTimestamp.transform
        const viewportChanged = linkState.modifyTimestamp.viewport > this.lastSyncDownTimestamp.viewport


        // Global / Symbol
        if (linkState.modifyTimestamp.global > this.lastSyncDownTimestamp.global) {
            // Note: Keeping just the timestamp updated if you don't directly override local symbol yet
            this.lastSyncDownTimestamp.global = linkState.modifyTimestamp.global;
        }

        // Crosshair
        if (crosshairChanged) {
            const crosshairTimestamp = linkState.crosshair?.timestamp;

            if (linkState.symbol === currentSymbol) {
                const crosshairPrice = linkState.crosshair?.price;
                if (crosshairTimestamp != null && crosshairPrice != null) {
                    const crosshairPixelX = this.chart?.viewport.converter.timestampToPixel(crosshairTimestamp);
                    const crosshairPixelY = this.chart?.viewport.converter.priceToPixel(crosshairPrice);
                    if (crosshairPixelX != null && crosshairPixelY != null) {
                        this.state?.crosshair.setAlt({ x: crosshairPixelX, y: crosshairPixelY });
                    } else {
                        this.state?.crosshair.setAlt(null);
                    }
                } else {
                    this.state?.crosshair.setAlt(null);
                }
            } else {
                const crosshairPriceOffsetRatio = linkState.crosshair?.alt.priceOffsetRatio;
                if (crosshairPriceOffsetRatio != null && crosshairTimestamp) {
                    const crosshairPricePixel = currentCanvasSize.h * crosshairPriceOffsetRatio;
                    const crosshairTimePixel = this.chart?.viewport.converter.timestampToPixel(crosshairTimestamp);
                    if (crosshairPricePixel != null && crosshairTimePixel != null) {
                        this.state?.crosshair.setAlt({ x: crosshairTimePixel, y: crosshairPricePixel });
                    } else {
                        this.state?.crosshair.setAlt(null);
                    }
                } else {
                    this.state?.crosshair.setAlt(null);
                }
            }
            this.lastSyncDownTimestamp.crosshair = linkState.modifyTimestamp.crosshair;
        }

        // Transform
        if (transformChanged) {
            if (linkState.transform){
                this.state?.viewport.setTransform(linkState.transform)
            }
            this.lastSyncDownTimestamp.transform = linkState.modifyTimestamp.transform;
        }

        // Viewport
        if (viewportChanged) {
            if (linkState.viewport) {
                const newViewport = {
                    fromTs: linkState.viewport.fromTs,
                    toTs: linkState.viewport.toTs,
                    fromPrice: linkState.viewport.fromPrice,
                    toPrice: linkState.viewport.toPrice
                }

                if (currentSymbol != linkState.symbol) {
                    while (true) {
                        if (
                            this.cachedHighestPrice == null ||
                            this.cachedLowestPrice == null
                        ) break

                        const priceDelta = Math.abs(
                            this.cachedHighestPrice - this.cachedLowestPrice
                        )

                        const pixelDelta =
                            currentCanvasSize.h *
                            linkState.viewport.alt.priceDeltaRatio

                        const multi = pixelDelta / priceDelta

                        const pixelOffset =
                            currentCanvasSize.h *
                            linkState.viewport.alt.priceOffsetRatio

                        const altFromPrice =
                            this.cachedHighestPrice -
                            (currentCanvasSize.h - pixelOffset) / multi

                        const altToPrice =
                            this.cachedHighestPrice +
                            pixelOffset / multi

                        newViewport.fromPrice = altFromPrice
                        newViewport.toPrice = altToPrice

                        this.state?.config.set({
                            viewport: newViewport
                        })

                        break
                    }
                } else {
                    this.state?.config.set({
                        viewport: newViewport
                    })
                }
            }
            this.lastSyncDownTimestamp.viewport = linkState.modifyTimestamp.viewport;
        }
    };
}