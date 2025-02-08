import { Dispatch, MutableRefObject, SetStateAction, useEffect, useRef, useState } from "react";
import { FrontendMonitor, Rotation } from "../globalValues";
import { invoke } from "@tauri-apps/api/core";
import "./ApplySettingsPopup.css"
interface ApplySettingsPopupProps {
    customMonitors: FrontendMonitor[];
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    normalizePositionsRef: MutableRefObject<Function | null>;
    applyChangesRef: MutableRefObject<Function | null>;
}
interface MonitorApplyState {
    overall: AttemptState,
    enabled: AttemptState,
    position: AttemptState,
    rotaiton: AttemptState,
    mode: AttemptState,
}
enum AttemptState {
    Waiting = "waiting",
    InProgress = "inProgress",
    Completed = "completed",
    Failed = "failed"
}
interface Attempt {
    completed: boolean,
    reason: string,
}
interface FailInfos {
    monitorIdx: number,
    settingName: string,
    reason: string
}
export const ApplySettingsPopup: React.FC<ApplySettingsPopupProps> = ({ applyChangesRef, initialMonitors, normalizePositionsRef }) => {
    let defaultMonitorApplyState: MonitorApplyState = {
        overall: AttemptState.Waiting,
        enabled: AttemptState.Waiting,
        position: AttemptState.Waiting,
        rotaiton: AttemptState.Waiting,
        mode: AttemptState.Waiting
    };
    useEffect(() => {
        applyChangesRef.current = applyAllChanges;
    }, []);
    const failList = useRef<FailInfos[]>([]);
    const [showPopup, setShowPopup] = useState(false);
    const [monitorStates, setMonitorStates] = useState<MonitorApplyState[]>(new Array(initialMonitors.current.length).fill(
        { ...defaultMonitorApplyState }
    ));
    //TODO: add an undo feature(per change, per monitor with sleeps happening inbetween to allow the user to change it)
    //TODO: fix freehand position losing  state
    //TODO: do more testing for combinations of changes
    //TODO: possibly diable the scrolling happening in the background
    async function applyAllChanges(customMonitors: FrontendMonitor[], monitorsBeingApplied: number[]) {
        setShowPopup(true);
        console.log("Pop up showing");
        setMonitorStates(new Array(initialMonitors.current.length).fill(
            { ...defaultMonitorApplyState }
        ));
        for (let i = 0; i < monitorsBeingApplied.length; i++) {
            //set new monitor to in progress along with enable
            setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, overall: AttemptState.InProgress, enabled: AttemptState.InProgress } : mon)));
            //enable
            let enableAttempt = await applyEnable(monitorsBeingApplied[i], customMonitors);
            if (enableAttempt.completed) {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, enabled: AttemptState.Completed } : mon)));
            } else {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, enabled: AttemptState.Failed } : mon)));
                failList.current.push({
                    monitorIdx: monitorsBeingApplied[i],
                    settingName: "enabled",
                    reason: enableAttempt.reason
                });
            }
            //position
            setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, position: AttemptState.InProgress } : mon)));
            let positionAttempt = await applyPosition(monitorsBeingApplied[i], customMonitors);
            if (positionAttempt.completed) {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, position: AttemptState.Completed } : mon)));
            } else {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, position: AttemptState.Failed } : mon)));
                failList.current.push({
                    monitorIdx: monitorsBeingApplied[i],
                    settingName: "positions",
                    reason: positionAttempt.reason
                });
            }
            //rotation
            setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, rotaiton: AttemptState.InProgress } : mon)));
            let rotationAttempt = await applyRotation(monitorsBeingApplied[i], customMonitors);
            if (rotationAttempt.completed) {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, rotaiton: AttemptState.Completed } : mon)));
            } else {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, rotaiton: AttemptState.Failed } : mon)));
                failList.current.push({
                    monitorIdx: monitorsBeingApplied[i],
                    settingName: "rotation",
                    reason: rotationAttempt.reason
                });
            }
            //mode
            setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, mode: AttemptState.InProgress } : mon)));
            let modeAttempt = await applyModePreset(monitorsBeingApplied[i], customMonitors);
            if (modeAttempt.completed) {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, mode: AttemptState.Completed } : mon)));
            } else {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, mode: AttemptState.Failed } : mon)));
                failList.current.push({
                    monitorIdx: monitorsBeingApplied[i],
                    settingName: "mode",
                    reason: modeAttempt.reason
                });
            }

        }
        setShowPopup(false);
        console.log("Pop up closing");
    }
    async function applyEnable(focusedMonitorIdx: number, customMonitors: FrontendMonitor[]): Promise<Attempt> {
        let newMonitorEnabledSetting = customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0;
        let output: Attempt = { completed: true, reason: "" };
        console.log("apply enabled called on ", focusedMonitorIdx);
        if (!(newMonitorEnabledSetting === (initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0))) {
            console.log("enable internal called");
            await invoke("set_enabled", {
                xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                enabled: newMonitorEnabledSetting
            }).then(() => {
                if (!newMonitorEnabledSetting) {
                    initialMonitors.current[focusedMonitorIdx].outputs[0].xid = 0;
                    initialMonitors.current[focusedMonitorIdx].x = 0;
                    initialMonitors.current[focusedMonitorIdx].y = 0;
                    initialMonitors.current[focusedMonitorIdx].outputs[0].rotation = Rotation.Normal;
                    if (initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode) {
                        initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.width = initialMonitors.current[focusedMonitorIdx].widthPx;
                        initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.height = initialMonitors.current[focusedMonitorIdx].heightPx;
                    }
                } else {
                    /*
                    crtc.mode = mode.xid;
                    crtc.width = mode.width;
                    crtc.height = mode.height;
                    */
                    let prefMode = initialMonitors.current[focusedMonitorIdx].outputs[0].preferredModes[0];
                    initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode = prefMode;
                    initialMonitors.current[focusedMonitorIdx].widthPx = prefMode.width;
                    initialMonitors.current[focusedMonitorIdx].heightPx = prefMode.height;

                    //TODO: add custom modes in here to apply this

                }
                output = { completed: true, reason: "" };
            }).catch((reason) => {
                output = { completed: false, reason: reason };
            });
        }
        return output;

    }
    async function applyRotation(focusedMonitorIdx: number, customMonitors: FrontendMonitor[]): Promise<Attempt> {
        let output: Attempt = { completed: true, reason: "" };
        console.log("apply rotation called on ", focusedMonitorIdx);
        if (!(customMonitors[focusedMonitorIdx].outputs[0].rotation == initialMonitors.current[focusedMonitorIdx].outputs[0].rotation)) {
            console.log("rotation internal called");
            await invoke("set_rotation", {
                xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                rotation: customMonitors[focusedMonitorIdx].outputs[0].rotation
            }).then(() => {
                initialMonitors.current[focusedMonitorIdx].outputs[0].rotation = customMonitors[focusedMonitorIdx].outputs[0].rotation;
                output = { completed: true, reason: "" };
            }).catch((reason) => {
                output = { completed: false, reason: reason };
            });
        }
        return output;
    }
    async function applyPosition(focusedMonitorIdx: number, customMonitors: FrontendMonitor[]): Promise<Attempt> {
        //TODO: ensure that freehand position comes before any of the other screens
        console.log("apply positions called on ", focusedMonitorIdx);
        let output: Attempt = { completed: true, reason: "" };
        console.log("position function called");
        console.log("initial X:", initialMonitors.current[focusedMonitorIdx].x, "| Y:", initialMonitors.current[focusedMonitorIdx].y);
        console.log("cust X:", customMonitors[focusedMonitorIdx].x, "| Y:", customMonitors[focusedMonitorIdx].y);
        if (!(customMonitors[focusedMonitorIdx].x == initialMonitors.current[focusedMonitorIdx].x
            && customMonitors[focusedMonitorIdx].y == initialMonitors.current[focusedMonitorIdx].y)) {
            console.log("positions internal called");
            if (normalizePositionsRef.current) {
                normalizePositionsRef.current();
            }
            console.log("checks passed");
            await invoke("set_position", {
                xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                x: customMonitors[focusedMonitorIdx].x,
                y: customMonitors[focusedMonitorIdx].y
            }).then(() => {
                initialMonitors.current[focusedMonitorIdx].x = customMonitors[focusedMonitorIdx].x;
                initialMonitors.current[focusedMonitorIdx].y = customMonitors[focusedMonitorIdx].y;
                output = { completed: true, reason: "" };
            }).catch((reason) => {
                output = { completed: false, reason: reason };
            });
        }
        return output;
    }
    async function applyModePreset(focusedMonitorIdx: number, customMonitors: FrontendMonitor[]): Promise<Attempt> {
        let output: Attempt = { completed: true, reason: "" };
        console.log("apply mode called on ", focusedMonitorIdx);
        if (!(customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid == initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid)) {
            console.log("mode internal called");
            await invoke("set_mode", {
                outputXid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                mode: customMonitors[focusedMonitorIdx].outputs[0].modes.find((mode) => (mode.xid === customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid))
            }).then(() => {
                initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode! = customMonitors[focusedMonitorIdx].outputs[0].currentMode!;
                output = { completed: true, reason: "" };
            }).catch((reason) => {
                output = { completed: false, reason: reason };
            });
        }
        return output;
    }

    return (<div className="popup" style={{ display: showPopup ? "block" : "none" }}>
        <div className="popupContentsContainer" >
            <h1 style={{ marginLeft: "auto", marginRight: "auto" }}>Applying Settings</h1>
            <div style={{ display: "flex", flexDirection: "row", width: "100%" }}>
                <h4 className="legendsText" id={AttemptState.Waiting}>Waiting</h4>
                <h4 className="legendsText" id={AttemptState.InProgress}>In Progress</h4>
                <h4 className="legendsText" id={AttemptState.Completed}>Completed</h4>
                <h4 className="legendsText" id={AttemptState.Failed}>Failed</h4>
            </div>
            <div className="monitorStatesContainer">
                {initialMonitors.current.map((mon, idx) => (<div className="monitorState" >
                    <h2 id={monitorStates[idx].overall}>{mon.name}</h2>
                    <hr />
                    <h4 id={monitorStates[idx].enabled} >Enabled:{monitorStates[idx].enabled}</h4>
                    <h4 id={monitorStates[idx].position} >Position:{monitorStates[idx].position}</h4>
                    <h4 id={monitorStates[idx].rotaiton} >Rotation:{monitorStates[idx].rotaiton}</h4>
                    <h4 id={monitorStates[idx].mode} >Mode:{monitorStates[idx].mode}</h4>
                </div>))}
            </div>
        </div>
    </div>)

};
export default ApplySettingsPopup;