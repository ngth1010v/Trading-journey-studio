import FixedContainer from "./containers/FixedContainer"
import CandleChart from "./charts/candleChart/CandleChart"

export const ELEMENT_MAP = {
    "container.FixedContainer": {
        component: FixedContainer,
        name: "Fixed container",
    },
    "chart.CandleChart": {
        component: CandleChart,
        name: "Candle Chart",
    }
}