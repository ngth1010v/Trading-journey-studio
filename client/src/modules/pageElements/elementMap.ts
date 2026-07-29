import FixedContainer from "./containers/FixedContainer"
import VerticalContainer from "./containers/VerticalContainer"
import HorizontalContainer from "./containers/HorizontalContainer"
import CandleChart from "./charts/candleChart/CandleChart"

export const ELEMENT_MAP = {
    "container.FixedContainer": {
        component: FixedContainer,
        name: "Fixed container",
        data: {
            rows: 10,
            columns: 20,
            gap: "5px",
            padding: "5px"
        }
    },
    "container.VerticalContainer": {
        component: VerticalContainer,
        name: "Vertical container",
        data: {
            itemHeight: "50px",
            rows: 20,
            columns: 20,
            gap: "5px",
            padding: "5px"
        }
    },
    "container.HorizontalContainer": {
        component: HorizontalContainer,
        name: "Horizontal container",
        data: {
            itemWidth: "50px",
            columns: 30,
            rows: 10,
            gap: "5px",
            padding: "5px"
        }
    },
    "chart.CandleChart": {
        component: CandleChart,
        name: "Candle Chart",
        data: {}
    }
}