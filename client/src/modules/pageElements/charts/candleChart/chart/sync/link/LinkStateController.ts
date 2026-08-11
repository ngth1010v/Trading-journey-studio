import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import type { LinkState } from "../../../state/sync/link/state/LinkStateData";

const BASE_ID = "[chart][viewport][ViewportSync]";

export default class LinkStateController {
    private state: StateData | null = null;
    private chart: ChartController | null = null;

    private lastSyncDownTimestamp: number = 0;

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
        this.state.config.addOnConfigDataChange( BASE_ID + "viewportSyncId sync up", ["viewportSyncId"], this.scheduleSyncUp );
        this.state.config.addOnConfigDataChange( BASE_ID + "symbol sync up", ["symbol"], this.onCandleDataChange );
       
        // Viewport
        this.state.config.addOnConfigDataChange( BASE_ID + "viewport sync up", ["viewport"], this.scheduleSyncUp );
        this.state.source.candle.addOnClosedCandleDataChange( BASE_ID + "closedCandle sync up", this.onCandleDataChange );
        this.state.source.candle.addOnOpeningCandleDataChange( BASE_ID + "openingCandle sync up", this.onCandleDataChange );
        
        // Transform
        this.state.viewport.addOnViewportTransformDataChange(BASE_ID + "transform sync up",this.scheduleSyncUp);

        // Crosshair
        this.state.crosshair.addOnCrosshairDataChange( BASE_ID + "crosshair sync up", this.scheduleSyncUp );


        
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

    private onCandleDataChange = (): void => {
        this.isCandleDirty = true;
        this.scheduleSyncUp();
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
        state.modifyTimestamp = Date.now();
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
                if (t[i] < view.fromTs || view.toTs < t[i]) continue
                if (h[i] > highestPrice) highestPrice = h[i];
                if (l[i] < lowestPrice) lowestPrice = l[i];
            }

            const openingCandle = this.state?.source.candle.getOpening();
            if (openingCandle) {
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

        this.calcCandleMinMax()
        
        const symbol = this.state?.config.get()?.symbol;
        if (!symbol) return
        const canvasSize = this.chart?.event.getCanvasSize();
        if (!canvasSize || canvasSize.h === 0) return


        // Crosshair
        let newCrosshairState = null
        while(true){
            const crosshairPixel = this.state?.crosshair.getPixel();
            if (!crosshairPixel) break

            const crosshairTime = this.chart?.viewport.converter.pixelToTimestamp(crosshairPixel.x);
            const crosshairPrice = this.chart?.viewport.converter.pixelToPrice(crosshairPixel.y);
            const priceOffsetRatio = crosshairPixel.y / canvasSize.h
            if (crosshairTime == null || crosshairPrice == null) break;

            newCrosshairState = {
                price: crosshairPrice,
                timestamp: crosshairTime,
                alt: {
                    priceOffsetRatio: priceOffsetRatio    
                }
            }
        break}


        // Viewport
        let newViewportState = null
        while(true){
            const viewport = this.state?.config.get()?.viewport;
            if (!viewport) break

            if (!this.cachedHighestPrice || !this.cachedLowestPrice) break
            const highestPricePixel = this.chart?.viewport.converter.priceToPixel(this.cachedHighestPrice);
            const lowestPricePixel = this.chart?.viewport.converter.priceToPixel(this.cachedLowestPrice);
            if (highestPricePixel == null || lowestPricePixel == null) break
          
            const priceDeltaRatio = Math.abs(lowestPricePixel - highestPricePixel) / canvasSize.h
            const priceOffsetRatio = highestPricePixel / canvasSize.h

            newViewportState = {
                fromTs: viewport.fromTs,
                toTs: viewport.toTs,
                fromPrice: viewport.fromPrice,
                toPrice: viewport.toPrice,
                alt: {  
                    priceDeltaRatio: priceDeltaRatio,
                    priceOffsetRatio: priceOffsetRatio,      
                }
            }
        break}

        // Transform
        let newTransformState = null
        while(true){
            const transform = this.state?.viewport.getTransform()
            if (!transform) break


            newTransformState = {
                scaleX: transform.scaleX,
                scaleY: transform.scaleY,
                offsetX: transform.offsetX,
                offsetY: transform.offsetY
            }
        break}

        const newState: LinkState = {
            modifyTimestamp: Date.now(),
            symbol,
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
        if (!linkState) return;
        if (linkState.modifyTimestamp != null && linkState.modifyTimestamp <= this.lastSyncDownTimestamp) return;

        const currentSymbol = this.state?.config.get()?.symbol;
        if (!currentSymbol) return;
        const currentCanvasSize = this.chart?.event.getCanvasSize();
        if (!currentCanvasSize || currentCanvasSize.h == 0) return;

        // Crosshair
        {
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
        }

        // Transform
        if (linkState.transform){
            this.state?.viewport.setTransform(linkState.transform)
        }

        // Viewport
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


        if (linkState.modifyTimestamp != null) {
            this.lastSyncDownTimestamp = linkState.modifyTimestamp;
        }
    };
}