import type StateData from "../../../state/StateData";
import FixedHorizontalList from "../../../../../../shared/components/list/FixedHorizontalList";
import SourceSymbolBar from "./symbol/SourceSymbolBar";
import SourceTimeframeBar from "./timeframe/SourceTimeframeBar";

export default function SourceBar({ state }: { state: StateData }) {
    return (
        <FixedHorizontalList
            dividerList={[true, false]}
        >
            {/* SYMBOL BAR */}
            <SourceSymbolBar state={state} />

            {/* TIMEFRAME BAR */}
            <SourceTimeframeBar state={state} />

        </FixedHorizontalList>
    );
}