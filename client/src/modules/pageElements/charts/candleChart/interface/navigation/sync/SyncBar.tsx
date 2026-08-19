import type StateData from "../../../state/StateData";
import FixedHorizontalList from "../../../../../../shared/components/list/FixedHorizontalList";
import ViewportSyncBar from "./link/LinkBar";
import LinkCrosshairBar from "./linkCrosshair/LinkCrosshairBar";
import LinkViewportBar from "./linkViewport/LinkViewportBar";

export default function SyncBar({ state }: { state: StateData }) {
    return (
        <FixedHorizontalList dividerList={[true, false, false]}>
            <ViewportSyncBar state={state} />
            <LinkCrosshairBar state={state} />
            <LinkViewportBar state={state} />
        </FixedHorizontalList>
    );
}