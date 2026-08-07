import type StateData from "../../../state/StateData";
import FixedHorizontalList from "../../../../../../shared/components/list/FixedHorizontalList";
import StrategyDataBar from "./data/StrategyDataBar";
import StrategyTagBar from "./tag/StrategyTagBar";
import StrategySeasonBar from "./season/StrategySeasonBar";
import StrategyFloatingBar from "./floatingBar/StrategyFloatingBar";

export default function StrategyBar({ state }: { state: StateData }) {
    return (
        <FixedHorizontalList
            dividerList={[true, true, true, false]}
        >
            {/* STRATEGY DATA BAR */}
            <StrategyDataBar state={state} />

            {/* STRATEGY TAG BAR */}
            <StrategyTagBar state={state} />

            {/* STRATEGY SEASON BAR */}
            <StrategySeasonBar state={state} />

            {/* STRATEGY FLOATING BAR */}
            <StrategyFloatingBar state={state} />
        </FixedHorizontalList>
    );
}