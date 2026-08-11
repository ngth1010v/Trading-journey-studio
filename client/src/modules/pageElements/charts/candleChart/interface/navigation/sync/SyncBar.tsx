import type StateData from "../../../state/StateData";
import FixedHorizontalList from "../../../../../../shared/components/list/FixedHorizontalList";
import ViewportSyncBar from "./link/LinkBar";

export default function SyncBar({ state }: { state: StateData }) {
    return (
        <FixedHorizontalList dividerList={[false]}>
            <ViewportSyncBar state={state} />
        </FixedHorizontalList>
    );
}