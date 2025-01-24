import { Dispatch, MutableRefObject, SetStateAction } from "react";
import { FrontendMonitor } from "../globalInterfaces";
import "./FocusedMonitorSettings.css";
import { Application, Renderer } from "pixi.js";
interface FocusedMonitorSettingsProps {
    focusedMonitorIdx: number;
    monitorScale: number;
    screenDragOffsetTotal: MutableRefObject<point>;
    freeHandPositionCanvas: MutableRefObject<Application<Renderer> | null>
    customMonitor: FrontendMonitor[];
    initialMonitors: FrontendMonitor[];
    setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
}
export const FocusedMonitorSettings: React.FC<FocusedMonitorSettingsProps> = ({ monitorScale, screenDragOffsetTotal, freeHandPositionCanvas, focusedMonitorIdx, customMonitor, initialMonitors, setMonitors }) => {
    function setPositionX(x: number) {
        if (freeHandPositionCanvas.current) {
            freeHandPositionCanvas.current.stage.children[focusedMonitorIdx].x = x / monitorScale + screenDragOffsetTotal.current.x;
        }
        setMonitors((mons) =>
            mons.map((curMon, idx) =>
                idx === focusedMonitorIdx
                    ? { ...curMon, x: x }
                    : curMon
            )
        );
    }
    function setPositionY(y: number) {
        if (freeHandPositionCanvas.current) {
            freeHandPositionCanvas.current.stage.children[focusedMonitorIdx].y = y / monitorScale + screenDragOffsetTotal.current.y;
        }
        setMonitors((mons) =>
            mons.map((curMon, idx) =>
                idx === focusedMonitorIdx
                    ? { ...curMon, y }
                    : curMon
            )
        );
    }
    function resetPosition() {
        setMonitors((mons) => mons.map((curMon, idx) => ({ ...curMon, x: initialMonitors[idx].x / monitorScale, y: initialMonitors[idx].y / monitorScale })));
    }
    //THE LABELS will not update because currently the monitors are being passed as value(i think, will have to do more testing with the state of positions)
    return (<div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Position:</h2>
            </div>
            <div className="settingsEditorContainer">
                <h2 style={{ marginTop: "auto", marginBottom: "auto" }}>X:</h2>
                <input type="number" value={customMonitor[focusedMonitorIdx].x} onChange={(eve) => setPositionX(Number(eve.target.value))} />
                <h2 style={{ marginTop: "auto", marginBottom: "auto", marginLeft: "15px" }}>Y:</h2>
                <input type="number" value={customMonitor[focusedMonitorIdx].y} onChange={(eve) => setPositionY(Number(eve.target.value))} />
                <button onClick={resetPosition}>Reset</button>
            </div>
        </div>

    </div>);
};
export default FocusedMonitorSettings;