import { Dispatch, SetStateAction } from "react";
import { FrontendMonitor } from "../xrandr_exports";
import "./FocusedMonitorSettings.css";
interface FocusedMonitorSettingsProps {
    customFocusedMonitor: FrontendMonitor;
    initialFocusedMonitors: FrontendMonitor;
    setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
}
export const FocusedMonitorSettings: React.FC<FocusedMonitorSettingsProps> = ({ customFocusedMonitor, initialFocusedMonitors, setMonitors }) => {
    function setPositionX(x: number) {
        setMonitors((mons) =>
            mons.map((curMon) =>
                curMon.name === initialFocusedMonitors.name
                    ? { ...curMon, x: x }
                    : curMon
            )
        );
    }
    function setPositionY(y: number) {
        setMonitors((mons) =>
            mons.map((curMon) =>
                curMon.name === initialFocusedMonitors.name
                    ? { ...curMon, y }
                    : curMon
            )
        );
    }
    //THE LABELS will not update because currently the monitors are being passed as value(i think, will have to do more testing with the state of positions)
    return (<div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Position:</h2>
            </div>
            <div className="settingsEditorContainer">
                <h2 style={{ marginTop: "auto", marginBottom: "auto" }}>X:</h2>
                <input type="number" value={customFocusedMonitor.x} onChange={(eve) => setPositionX(Number(eve.target.value))} />
                <h2 style={{ marginTop: "auto", marginBottom: "auto", marginLeft: "15px" }}>Y:</h2>
                <input type="number" value={customFocusedMonitor.y} onChange={(eve) => setPositionY(Number(eve.target.value))} />
                <button>Reset</button>
            </div>
        </div>

    </div>);
};
export default FocusedMonitorSettings;