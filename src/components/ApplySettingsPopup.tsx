import { Dispatch, MutableRefObject, SetStateAction, useEffect, useRef, useState } from "react";
import { FrontendMonitor, Rotation } from "../globalValues";
import { invoke } from "@tauri-apps/api/core";
import "./ApplySettingsPopup.css"
import { focusedSettingsFunctions } from "./LoadedScreen";
interface ApplySettingsPopupProps {
    customMonitors: FrontendMonitor[];
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    normalizePositionsRef: MutableRefObject<((customMonitors: FrontendMonitor[]) => void) | null>;
    applyChangesRef: MutableRefObject<Function | null>;
    resetFunctions: MutableRefObject<focusedSettingsFunctions>;
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

    const [undoButtonText, setUndoButtonText] = useState("...");
    const [nextButtonText, setNextButtonText] = useState("...");
    const [buttonsEnabled, setButtonsEnabled] = useState(false);
    const [onErrorScreen, setOnErrorScreen] = useState(false);
    const undoButtonPressed = useRef(false);
    const nextButtonPressed = useRef(false);

    //TODO: check how enable interacts with everything
    //TODO: possibly disable the scrolling happening in the background
    async function applyAllChanges(customMonitors: FrontendMonitor[], monitorsBeingApplied: number[]) {
        setShowPopup(true);
        setNextButtonText("...");
        setOnErrorScreen(false);
        failList.current = [];
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
            let modeAttempt = await applyMode(monitorsBeingApplied[i], customMonitors, true);
            setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, mode: modeAttempt.state } : mon)));
            if (modeAttempt.state === AttemptState.Failed) {
                failList.current.push({
                    monitorIdx: monitorsBeingApplied[i],
                    settingName: "mode",
                    reason: modeAttempt.reason
                });
            }

            //overall
            //TODO: this is not working properly
            if (failList.current.findIndex((fail) => (fail.monitorIdx === monitorsBeingApplied[i])) !== -1) {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, overall: AttemptState.Failed } : mon)));
            } else {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === i ? { ...mon, overall: AttemptState.Completed } : mon)));
            }
        }
        setOnErrorScreen(true);
    }
    async function applyEnable(focusedMonitorIdx: number, customMonitors: FrontendMonitor[]): Promise<Attempt> {
        let newMonitorEnabledSetting = customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0;
        let oldMonitorEnabledSetting = initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0;
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        console.log("apply enabled called on ", focusedMonitorIdx);
        if (newMonitorEnabledSetting !== oldMonitorEnabledSetting) {
            console.log("enable internal called");
            await invoke<number>("set_enabled", {
                xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                enabled: newMonitorEnabledSetting
            }).then(async (newCrtc) => {
                if (await promptUserToUndo()) {
                    resetFunctions.current.enable!(focusedMonitorIdx, oldMonitorEnabledSetting);
                    await invoke("set_enabled", {
                        xid: initialMonitors.current[focusedMonitorIdx].outputs[0].xid,
                        enabled: oldMonitorEnabledSetting
                    }).then((_newCrtc) => {
                        resetFunctions.current.position!(focusedMonitorIdx);
                        resetFunctions.current.rotation!(focusedMonitorIdx);
                        output = { state: AttemptState.Undone, reason: "" };
                    });
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
                        resetFunctions.current.setCrtc!(focusedMonitorIdx, newCrtc);
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
                    await resetFunctions.current.rotation!(focusedMonitorIdx);

                    await invoke("set_rotation", {
                        outputCrtc: initialMonitors.current[focusedMonitorIdx].outputs[0].crtc,
                        rotation: initialMonitors.current[focusedMonitorIdx].outputs[0].rotation
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
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        console.log("position function called");
        if (!(customMonitors[focusedMonitorIdx].x === initialMonitors.current[focusedMonitorIdx].x
            && customMonitors[focusedMonitorIdx].y === initialMonitors.current[focusedMonitorIdx].y)) {
            console.log("positions internal called");
            if (normalizePositionsRef.current) {
                normalizePositionsRef.current(customMonitors);
            }
            await invoke("set_position", {
                outputCrtc: customMonitors[focusedMonitorIdx].outputs[0].crtc,
                x: customMonitors[focusedMonitorIdx].x,
                y: customMonitors[focusedMonitorIdx].y
            }).then(async () => {
                if (shouldPromptRedo && await promptUserToUndo()) {
                    console.log("internals of redo func called")
                    resetFunctions.current.position!(focusedMonitorIdx);
                    console.log("output:", customMonitors[focusedMonitorIdx].outputs[0].crtc, ",x:", customMonitors[focusedMonitorIdx].x, ",y:", customMonitors[focusedMonitorIdx].y)
                    await invoke("set_position", {
                        outputCrtc: customMonitors[focusedMonitorIdx].outputs[0].crtc,
                        x: initialMonitors.current[focusedMonitorIdx].x.toFixed(0),
                        y: initialMonitors.current[focusedMonitorIdx].y.toFixed(0)
                    })
                    output = { state: AttemptState.Undone, reason: "" };
                } else {
                    initialMonitors.current[focusedMonitorIdx].x = customMonitors[focusedMonitorIdx].x;
                    initialMonitors.current[focusedMonitorIdx].y = customMonitors[focusedMonitorIdx].y;
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
    async function applyMode(focusedMonitorIdx: number, customMonitors: FrontendMonitor[], shouldPromptRedo: boolean): Promise<Attempt> {
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        let focusedRotation = customMonitors[focusedMonitorIdx].outputs[0].rotation;
        let oldMode = initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!;
        let newMode = customMonitors[focusedMonitorIdx].outputs[0].currentMode!;
        console.log("apply mode called on ", focusedMonitorIdx);
        if (newMode.xid !== oldMode.xid) {
            console.log("mode internal called");
            await invoke("set_mode", {
                outputCrtc: customMonitors[focusedMonitorIdx].outputs[0].crtc,
                modeXid: newMode.xid,
                modeHeight: focusedRotation === Rotation.Normal || Rotation.Right ? newMode.height : newMode.width,
                modeWidth: focusedRotation === Rotation.Normal || Rotation.Right ? newMode.width : newMode.height,
            }).then(async () => {
                if (shouldPromptRedo && await promptUserToUndo()) {
                    await invoke("set_mode", {
                        outputCrtc: customMonitors[focusedMonitorIdx].outputs[0].crtc,
                        modeXid: oldMode.xid,
                        modeHeight: focusedRotation === Rotation.Normal || Rotation.Right ? oldMode.height : oldMode.width,
                        modeWidth: focusedRotation === Rotation.Normal || Rotation.Right ? oldMode.width : oldMode.height,
                    });
                    resetFunctions.current.mode!(focusedMonitorIdx);
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
        setButtonsEnabled(true);
        undoButtonPressed.current = false;
        nextButtonPressed.current = false;
        setNextButtonText("Continue");
        for (let i = secondsToUndo; i > -1; i--) {
            if (undoButtonPressed.current) {
                setUndoButtonText("...");
                setNextButtonText("...");
                return true;
            } else if (nextButtonPressed.current) {
                setUndoButtonText("...");
                setNextButtonText("...");
                return false;
            } else {
                setUndoButtonText("Undo(" + i + ")");
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        setNextButtonText("...");
        setUndoButtonText("...");
        return false;

    }
    return (onErrorScreen ?
        <div className="popup" style={{ display: showPopup ? "block" : "none" }}>
            <div className="popupContentsContainer">
                <h1 className="popupTitle">Applying Errors</h1>
                <table className="errorTable">
                    <thead>
                        <tr>
                            <th>Monitor</th>
                            <th>Setting</th>
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        {failList.current.map((err) => (
                            <tr key={err.monitorIdx + err.settingName}>
                                <td>{initialMonitors.current[err.monitorIdx].name}</td>
                                <td>{err.settingName}</td>
                                <td>{err.reason}</td>
                            </tr>

                        ))}
                    </tbody>
                </table>
                <button className="finishButton" onClick={() => { setShowPopup(false) }}>Finish</button>
            </div>
        </div>
        :

        <div className="popup" style={{ display: showPopup ? "block" : "none" }}>
            <div className="popupContentsContainer" >
                <h1 className="popupTitle">Applying Settings</h1>
                <div className="monitorStatesContainer">
                    {initialMonitors.current.map((mon, idx) => (<div key={mon.name} className="monitorState" >
                        <h2 id={monitorStates[idx].overall}>{mon.name}</h2>
                        <hr />
                        <h4 id={monitorStates[idx].enabled} >Enabled:{monitorStates[idx].enabled}</h4>
                        <h4 id={monitorStates[idx].position} >Position:{monitorStates[idx].position}</h4>
                        <h4 id={monitorStates[idx].rotaiton} >Rotation:{monitorStates[idx].rotaiton}</h4>
                        <h4 id={monitorStates[idx].mode} >Mode:{monitorStates[idx].mode}</h4>
                    </div>))}
                </div>
                <div className="popupButtonContainer">
                    <button style={{ borderRadius: "0px 0px 0px 10px" }} className="popupButton" disabled={!buttonsEnabled} onClick={() => { undoButtonPressed.current = true }}>{undoButtonText}</button>
                    <button style={{ borderRadius: "0px 0px 10px 0px" }} className="popupButton" disabled={!buttonsEnabled} onClick={() => { nextButtonPressed.current = true }}>{nextButtonText}</button>
                </div>
            </div>
        </div>)

};
export default ApplySettingsPopup;