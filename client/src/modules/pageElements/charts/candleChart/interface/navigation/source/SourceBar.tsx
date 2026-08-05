import type StateData from "../../../state/StateData";
import ListWithTheme from "../../../../../../shared/components/ListWithTheme";
import SourceSymbolBar from "./symbol/SourceSymbolBar";
import SourceTimeframeBar from "./timeframe/SourceTimeframeBar";
import SourceStrategyBar from "./strategy/SourceStrategyBar";

export default function SourceBar({ state }: { state: StateData }) {
    return (
        <ListWithTheme
            type="horizontal"
            dividerList={[true, true, false]}
        >
            {/* SYMBOL BAR */}
            <SourceSymbolBar state={state} />

            {/* TIMEFRAME BAR */}
            <SourceTimeframeBar state={state} />

            {/* STRATEGY BAR */}
            <SourceStrategyBar state={state} />
        </ListWithTheme>
    );
}