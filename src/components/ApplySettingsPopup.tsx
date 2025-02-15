import { Dispatch, MutableRefObject, SetStateAction, useEffect, useRef, useState } from "react";
import { FrontendMonitor, Rotation } from "../globalValues";
import { invoke } from "@tauri-apps/api/core";
import "./ApplySettingsPopup.css"
import { ResetFunctions } from "./LoadedScreen";
interface ApplySettingsPopupProps {
    customMonitors: FrontendMonitor[];
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    normalizePositionsRef: MutableRefObject<Function | null>;
    applyChangesRef: MutableRefObject<Function | null>;
    resetFunctions: MutableRefObject<ResetFunctions>;
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
    Trial = "trialPeriod",
    Unchanged = "unchanged",
    Completed = "completed",
    Failed = "failed",
    Undone = "undone"
}
interface Attempt {
    state: AttemptState,
    reason: string,
}
interface FailInfos {
    monitorIdx: number,
    settingName: string,
    reason: string
}
export const ApplySettingsPopup: React.FC<ApplySettingsPopupProps> = ({ applyChangesRef, initialMonitors, normalizePositionsRef, resetFunctions }) => {
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
    const [buttonText, setButtonText] = useState("...");
    const [buttonEnabled, setButtonEnabled] = useState(false);
    const undoButtonPressed = useRef(false);
    //TODO: fix undo feature
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
            setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, enabled: enableAttempt.state } : mon)));
            if (enableAttempt.state === AttemptState.Failed) {
                failList.current.push({
                    monitorIdx: monitorsBeingApplied[i],
                    settingName: "enabled",
                    reason: enableAttempt.reason
                });
            }
            if (enableAttempt.state === AttemptState.Unchanged) {
                //position
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, position: AttemptState.InProgress } : mon)));
                let positionAttempt = await applyPosition(monitorsBeingApplied[i], customMonitors, true);
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, position: positionAttempt.state } : mon)));
                if (positionAttempt.state === AttemptState.Failed) {
                    failList.current.push({
                        monitorIdx: monitorsBeingApplied[i],
                        settingName: "positions",
                        reason: positionAttempt.reason
                    });
                }
                //rotation
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, rotaiton: AttemptState.InProgress } : mon)));
                let rotationAttempt = await applyRotation(monitorsBeingApplied[i], customMonitors, true);
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, rotaiton: rotationAttempt.state } : mon)));

                if (rotationAttempt.state === AttemptState.Failed) {
                    failList.current.push({
                        monitorIdx: monitorsBeingApplied[i],
                        settingName: "rotation",
                        reason: rotationAttempt.reason
                    });
                }
                //mode
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, mode: AttemptState.InProgress } : mon)));
                let modeAttempt = await applyModePreset(monitorsBeingApplied[i], customMonitors, true);
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, mode: modeAttempt.state } : mon)));
                if (modeAttempt.state === AttemptState.Failed) {
                    failList.current.push({
                        monitorIdx: monitorsBeingApplied[i],
                        settingName: "mode",
                        reason: modeAttempt.reason
                    });
                }
            } else {
                //enable was enacted
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, rotaiton: AttemptState.Completed, position: AttemptState.Completed, mode: AttemptState.Completed } : mon)));
            }
            //overall
            //TODO: this is not working properly
            if (failList.current.findIndex((fail) => (fail.monitorIdx === monitorsBeingApplied[i])) !== undefined) {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, overall: AttemptState.Failed } : mon)));
            } else {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, overall: AttemptState.Completed } : mon)));
            }
        }
        setShowPopup(false);
        console.log(failList);
        console.log("Pop up closing");
    }
    async function applyEnable(focusedMonitorIdx: number, customMonitors: FrontendMonitor[]): Promise<Attempt> {
        let newMonitorEnabledSetting = customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0;
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        console.log("apply enabled called on ", focusedMonitorIdx);
        if (!(newMonitorEnabledSetting === (initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0))) {
            console.log("enable internal called");
            await invoke("set_enabled", {
                xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                enabled: newMonitorEnabledSetting
            }).then(async () => {
                if (await promptUserToUndo()) {
                    resetFunctions.current.enable!(focusedMonitorIdx);
                    await invoke("set_enabled", {
                        xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                        enabled: newMonitorEnabledSetting
                    });
                    applyPosition(focusedMonitorIdx, customMonitors, false);
                    applyRotation(focusedMonitorIdx, customMonitors, false);
                    output = { state: AttemptState.Undone, reason: "" };
                }
                else {
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

                    }
                    output = { state: AttemptState.Completed, reason: "" };
                }
            }).catch((reason) => {
                output = { state: AttemptState.Failed, reason: reason };
            });
        }
        return output;

    }
    async function applyRotation(focusedMonitorIdx: number, customMonitors: FrontendMonitor[], shouldPromptRedo: boolean): Promise<Attempt> {
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        console.log("apply rotation called on ", focusedMonitorIdx);
        if (!(customMonitors[focusedMonitorIdx].outputs[0].rotation == initialMonitors.current[focusedMonitorIdx].outputs[0].rotation)) {
            console.log("rotation internal called");
            await invoke("set_rotation", {
                outputCrtc: customMonitors[focusedMonitorIdx].outputs[0].crtc,
                rotation: customMonitors[focusedMonitorIdx].outputs[0].rotation
            }).then(async () => {
                if (shouldPromptRedo && await promptUserToUndo()) {
                    //TODO: ensure these functions are non null before starting popup
                    resetFunctions.current.rotation!(focusedMonitorIdx);
                    await invoke("set_rotation", {
                        xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                        rotation: customMonitors[focusedMonitorIdx].outputs[0].rotation
                    });
                    output = { state: AttemptState.Undone, reason: "" };
                } else {
                    initialMonitors.current[focusedMonitorIdx].outputs[0].rotation = customMonitors[focusedMonitorIdx].outputs[0].rotation;
                    output = { state: AttemptState.Completed, reason: "" };

                }
            }).catch((reason) => {
                output = { state: AttemptState.Failed, reason: reason };
            });
        }
        return output;
    }
    async function applyPosition(focusedMonitorIdx: number, customMonitors: FrontendMonitor[], shouldPromptRedo: boolean): Promise<Attempt> {
        //TODO: ensure that freehand position comes before any of the other screens
        console.log("apply positions called on ", focusedMonitorIdx);
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        console.log("position function called");
        console.log("initial X:", initialMonitors.current[focusedMonitorIdx].x, "| Y:", initialMonitors.current[focusedMonitorIdx].y);
        console.log("cust X:", customMonitors[focusedMonitorIdx].x, "| Y:", customMonitors[focusedMonitorIdx].y);
        if (!(customMonitors[focusedMonitorIdx].x === initialMonitors.current[focusedMonitorIdx].x
            && customMonitors[focusedMonitorIdx].y === initialMonitors.current[focusedMonitorIdx].y)) {
            console.log("positions internal called");
            if (normalizePositionsRef.current) {
                normalizePositionsRef.current();
            }
            console.log("initial x:" + initialMonitors.current[focusedMonitorIdx].x + ", initial y:" + initialMonitors.current[focusedMonitorIdx].y)
            console.log("cust x:" + customMonitors[focusedMonitorIdx].x + ", cust y:" + customMonitors[focusedMonitorIdx].y)
            console.log("checks passed");
            await invoke("set_position", {
                outputCrtc: customMonitors[focusedMonitorIdx].outputs[0].crtc,
                x: customMonitors[focusedMonitorIdx].x,
                y: customMonitors[focusedMonitorIdx].y
            }).then(async () => {
                console.log("initial2 x:" + initialMonitors.current[focusedMonitorIdx].x + ", initial y:" + initialMonitors.current[focusedMonitorIdx].y)
                console.log("cust2 x:" + customMonitors[focusedMonitorIdx].x + ", cust y:" + customMonitors[focusedMonitorIdx].y)
                if (shouldPromptRedo && await promptUserToUndo()) {
                    console.log("internals of redo func called")
                    await resetFunctions.current.position!(focusedMonitorIdx);
                    console.log("output:", customMonitors[focusedMonitorIdx].outputs[0].crtc, ",x:", customMonitors[focusedMonitorIdx].x, ",y:", customMonitors[focusedMonitorIdx].y)
                    await invoke("set_position", {
                        outputCrtc: customMonitors[focusedMonitorIdx].outputs[0].crtc,
                        x: initialMonitors.current[focusedMonitorIdx].x,
                        y: initialMonitors.current[focusedMonitorIdx].y
                    })
                    output = { state: AttemptState.Undone, reason: "" };
                } else {
                    initialMonitors.current[focusedMonitorIdx].x = customMonitors[focusedMonitorIdx].x;
                    initialMonitors.current[focusedMonitorIdx].y = customMonitors[focusedMonitorIdx].y;
                    console.log("initial3 x:" + initialMonitors.current[focusedMonitorIdx].x + ", initial y:" + initialMonitors.current[focusedMonitorIdx].y)
                    console.log("cust3 x:" + customMonitors[focusedMonitorIdx].x + ", cust y:" + customMonitors[focusedMonitorIdx].y)
                    output = { state: AttemptState.Completed, reason: "" };
                }
            }).catch((reason) => {
                output = { state: AttemptState.Failed, reason: reason };
            });
            console.log("initial4 x:" + initialMonitors.current[focusedMonitorIdx].x + ", initial y:" + initialMonitors.current[focusedMonitorIdx].y)
            console.log("cust4 x:" + customMonitors[focusedMonitorIdx].x + ", cust y:" + customMonitors[focusedMonitorIdx].y)
        }
        return output;
    }
    async function applyModePreset(focusedMonitorIdx: number, customMonitors: FrontendMonitor[], shouldPromptRedo: boolean): Promise<Attempt> {
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        console.log("apply mode called on ", focusedMonitorIdx);
        if (!(customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid == initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid)) {
            console.log("mode internal called");
            await invoke("set_mode", {
                outputXid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                mode: customMonitors[focusedMonitorIdx].outputs[0].modes.find((mode) => (mode.xid === customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid))
            }).then(async () => {
                if (shouldPromptRedo && await promptUserToUndo()) {
                    resetFunctions.current.mode!(focusedMonitorIdx);
                    await invoke("set_mode", {
                        outputXid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                        mode: customMonitors[focusedMonitorIdx].outputs[0].modes.find((mode) => (mode.xid === customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid))
                    });
                    output = { state: AttemptState.Undone, reason: "" };
                } else {
                    initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode! = customMonitors[focusedMonitorIdx].outputs[0].currentMode!;
                    output = { state: AttemptState.Completed, reason: "" };
                }
            }).catch((reason) => {
                output = { state: AttemptState.Failed, reason: reason };
            });
        }
        return output;
    }

    //https://stackoverflow.com/questions/37764665/how-to-implement-sleep-function-in-typescript
    const secondsToUndo = 15;
    async function promptUserToUndo(): Promise<boolean> {
        setButtonEnabled(true);
        undoButtonPressed.current = false;
        for (let i = secondsToUndo; i > -1; i--) {
            if (undoButtonPressed.current) {
                setButtonText("...");
                return true;
            } else {
                setButtonText("Undo(" + i + ")");
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        setButtonText("...");
        return false;

    }
    return (<div className="popup" style={{ display: showPopup ? "block" : "none" }}>
        <div className="popupContentsContainer" >
            <h1 className="popupTitle">Applying Settings</h1>
            {/* for explaing legends but looks ugly
            <div className="legendsContainer">
                <h4 className="legendsText" id={AttemptState.Waiting}>Waiting</h4>
                <h4 className="legendsText" id={AttemptState.InProgress}>In Progress</h4>
                <h4 className="legendsText" id={AttemptState.Trial}>Trial Period</h4>
            </div>
            <div className="legendsContainer">
                <h4 className="legendsText" id={AttemptState.Undone}>Undone</h4>
                <h4 className="legendsText" id={AttemptState.Completed}>Completed</h4>
                <h4 className="legendsText" id={AttemptState.Failed}>Failed</h4>
            </div>
            */}
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
            <button className="undoButton" disabled={!buttonEnabled} onClick={() => { undoButtonPressed.current = true }}>{buttonText}</button>
        </div>
    </div>)

};
export default ApplySettingsPopup;