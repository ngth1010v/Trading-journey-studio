import type StateData from "../../../state/StateData";
import ListWithTheme from "../../../../../../shared/components/ListWithTheme";
import StrategyDataBar from "./data/StrategyDataBar";
import StrategyTagBar from "./tag/StrategyTagBar";
import StrategySeasonBar from "./season/StrategySeasonBar";

export default function StrategyBar({ state }: { state: StateData }) {
    return (
        <ListWithTheme
            type="horizontal"
            dividerList={[true, true, false]}
        >
            {/* STRATEGY DATA BAR */}
            <StrategyDataBar state={state} />

            {/* STRATEGY TAG BAR */}
            <StrategyTagBar state={state} />

            {/* STRATEGY SEASON BAR */}
            <StrategySeasonBar state={state} />
        </ListWithTheme>
    );
}