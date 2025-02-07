import { Dispatch, MutableRefObject, SetStateAction, useState } from "react";
import { FrontendMonitor, Rotation } from "../globalValues";
import { invoke } from "@tauri-apps/api/core";
import "./ApplySettingsPopup.css"
interface ApplySettingsPopupProps {
    monitorsBeingApplied: number[];
    customMonitors: FrontendMonitor[];
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    normalizePositionsRef: MutableRefObject<Function | null>
}
enum MonitorState {
    InProgress = "monitorInProgress",
    Waiting = "monitorWaiting",
    Completed = "monitorCompleted",
    Failed = "monitorFailed"
}
export const ApplySettingsPopup: React.FC<ApplySettingsPopupProps> = ({ monitorsBeingApplied, customMonitors, initialMonitors, normalizePositionsRef }) => {
    const [monitorStates, setMonitorStates] = useState(new Array(customMonitors.length).fill(MonitorState.Waiting));

    function applyEnable(focusedMonitorIdx: number) {
        let monitorEnabled = customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0;
        invoke("set_enabled", {
            xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
            enabled: monitorEnabled
        }).then(() => {
            initialMonitors.current[focusedMonitorIdx].outputs[0].xid = 0;
            initialMonitors.current[focusedMonitorIdx].x = 0;
            initialMonitors.current[focusedMonitorIdx].y = 0;
            initialMonitors.current[focusedMonitorIdx].outputs[0].rotation = Rotation.Normal;
            if (initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode) {
                initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.width = initialMonitors.current[focusedMonitorIdx].widthPx;
                initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.height = initialMonitors.current[focusedMonitorIdx].heightPx;
            }

            console.log("monitor disabled");
        }).catch((reason) => {
            //TODO:  handle error

            console.log("Enable not applied", reason);
        });

    }
    function applyRotation(focusedMonitorIdx: number) {
        if (!(customMonitors[focusedMonitorIdx].outputs[0].rotation == initialMonitors.current[focusedMonitorIdx].outputs[0].rotation)) {
            invoke("set_rotation", {
                xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                rotation: customMonitors[focusedMonitorIdx].outputs[0].rotation
            }).then(() => {
                initialMonitors.current[focusedMonitorIdx].outputs[0].rotation = customMonitors[focusedMonitorIdx].outputs[0].rotation;
                console.log("SET NEW MONITOR ROTATION");
            }).catch((reason) => {
                //TODO:  handle error

                console.log("Primary not properly set:", reason);
            });
        }
    }
    function applyPosition(focusedMonitorIdx: number) {
        //TODO: ensure that freehand position comes before any of the other screens
        if (normalizePositionsRef.current) {
            normalizePositionsRef.current();
        }
        console.log("position function called");
        if (!(customMonitors[focusedMonitorIdx].x == initialMonitors.current[focusedMonitorIdx].x
            && customMonitors[focusedMonitorIdx].y == initialMonitors.current[focusedMonitorIdx].y)) {
            console.log("checks passed");
            invoke("set_position", {
                xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                x: customMonitors[focusedMonitorIdx].x,
                y: customMonitors[focusedMonitorIdx].y
            }).then(() => {
                initialMonitors.current[focusedMonitorIdx].x = customMonitors[focusedMonitorIdx].x;
                initialMonitors.current[focusedMonitorIdx].y = customMonitors[focusedMonitorIdx].y;
                console.log("SET NEW MONITOR POSITION");
            }).catch((reason) => {
                //TODO:  handle error

                console.log("Primary not properly set:", reason);
            });
        }
    }
    function applyModePreset(focusedMonitorIdx: number) {
        if (!(customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid == initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid)) {
            invoke("set_mode", {
                outputXid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                mode: customMonitors[focusedMonitorIdx].outputs[0].modes.find((mode) => (mode.xid === customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid))
            }).then(() => {
                initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode! = customMonitors[focusedMonitorIdx].outputs[0].currentMode!;
                console.log("SET NEW MODE");
                console.log("mode sent = :", customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid);
            }).catch((reason) => {
                //TODO:  handle error
                console.log("Mode not properly set:", reason);
            });
        }
    }

    return (<div className="popup">
        <div style={{ display: "flex", flexDirection: "column", margin: "10px" }}>
            <h1 style={{ marginLeft: "auto", marginRight: "auto" }}>Applying Settings</h1>
            <div style={{ display: "flex", flexDirection: "row" }}>
                {customMonitors.map((mon, idx) => (<div className="monitorState" id={monitorStates[idx]}>{mon.name}</div>))}
            </div>
            <div style={{ marginLeft: "auto", marginRight: "auto" }}>
                <div>
                    <h2>Enabled</h2>
                </div>
                <div>
                    <h2>Position</h2>
                </div>
                <div>
                    <h2>Rotation</h2>
                </div>
                <div>
                    <h2>Mode</h2>
                </div>
            </div>
        </div>
    </div>)

};
export default ApplySettingsPopup;