import { MutableRefObject, useEffect, useRef, useState } from "react";
import { FrontendMonitor, Rotation } from "../globalValues";
import { invoke } from "@tauri-apps/api/core";
import "./ApplySettingsPopup.css"
import { focusedSettingsFunctions } from "./LoadedScreen";
interface ApplySettingsPopupProps {
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    normalizePositionsRef: MutableRefObject<((customMonitors: FrontendMonitor[]) => FrontendMonitor[]) | null>;
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
    const instancedMonitors = useRef<FrontendMonitor[]>([])
    const [undoButtonText, setUndoButtonText] = useState("...");
    const [nextButtonText, setNextButtonText] = useState("...");
    const [buttonsEnabled, setButtonsEnabled] = useState(false);
    const [onErrorScreen, setOnErrorScreen] = useState(true);
    const [monitorsBeingChangedState, setMonitorsBeingChangedState] = useState<number[]>([]);
    const undoButtonPressed = useRef(false);
    const nextButtonPressed = useRef(false);

    //TODO: possibly disable the scrolling happening in the background
    async function applyAllChanges(customMonitors: FrontendMonitor[], monitorsBeingApplied: number[]) {
        setNextButtonText("...");
        setOnErrorScreen(false);
        failList.current = [];
        console.log("Pop up showing");
        setMonitorStates(new Array(initialMonitors.current.length).fill(
            { ...defaultMonitorApplyState }
        ));

        instancedMonitors.current = [...customMonitors];
        if (normalizePositionsRef.current) {
            instancedMonitors.current = normalizePositionsRef.current!(instancedMonitors.current);
        }
        monitorsBeingApplied.sort((m1, m2) => instancedMonitors.current[m1].x - instancedMonitors.current[m2].x);
        setMonitorsBeingChangedState(monitorsBeingApplied);
        setShowPopup(true);
        for (let i = 0; i < monitorsBeingApplied.length; i++) {
            //set new monitor to in progress along with enable
            setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? { ...mon, overall: AttemptState.InProgress, enabled: AttemptState.InProgress } : mon)));
            //enable
            // console.log("enabled called on monitor#", i);
            // console.log([...instancedMonitors.current])
            let enableAttempt = await applyEnable(monitorsBeingApplied[i], instancedMonitors);
            setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? { ...mon, enabled: enableAttempt.state } : mon)));
            if (enableAttempt.state === AttemptState.Failed) {
                failList.current.push({
                    monitorIdx: monitorsBeingApplied[i],
                    settingName: "enabled",
                    reason: enableAttempt.reason
                });
            }
            //disabled or had to force an undo change(happens due to state not wanting to change due to the values === the initial without a change)
            if (!instancedMonitors.current[monitorsBeingApplied[i]].outputs[0].enabled || enableAttempt.state !== AttemptState.Undone) {
                // console.log("position called on monitor#", i);
                // console.log([...instancedMonitors.current])
                //position
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? { ...mon, position: AttemptState.InProgress } : mon)));
                let positionAttempt = await applyPosition(monitorsBeingApplied[i], instancedMonitors, false);
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? { ...mon, position: positionAttempt.state } : mon)));
                if (positionAttempt.state === AttemptState.Failed) {
                    failList.current.push({
                        monitorIdx: monitorsBeingApplied[i],
                        settingName: "positions",
                        reason: positionAttempt.reason
                    });
                }
                // console.log("rotation called on monitor#", i);
                // console.log([...instancedMonitors.current])
                // //rotation
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? { ...mon, rotaiton: AttemptState.InProgress } : mon)));
                let rotationAttempt = await applyRotation(monitorsBeingApplied[i], instancedMonitors, false);
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? { ...mon, rotaiton: rotationAttempt.state } : mon)));

                if (rotationAttempt.state === AttemptState.Failed) {
                    failList.current.push({
                        monitorIdx: monitorsBeingApplied[i],
                        settingName: "rotation",
                        reason: rotationAttempt.reason
                    });
                }
                // console.log("monitor called on monitor#", i);
                // console.log([...instancedMonitors.current])
                // //mode
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? { ...mon, mode: AttemptState.InProgress } : mon)));
                let modeAttempt = await applyMode(monitorsBeingApplied[i], instancedMonitors, false);
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? { ...mon, mode: modeAttempt.state } : mon)));
                if (modeAttempt.state === AttemptState.Failed) {
                    failList.current.push({
                        monitorIdx: monitorsBeingApplied[i],
                        settingName: "mode",
                        reason: modeAttempt.reason
                    });
                }
            } else {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? {
                    ...mon, position: AttemptState.Completed, rotation: AttemptState.Completed, mode: AttemptState.Completed
                } : mon)));
            }
            // console.log("monitor#", i, " finished");
            // console.log([...instancedMonitors.current])
            //overall
            if (failList.current.findIndex((fail) => (fail.monitorIdx === monitorsBeingApplied[i])) !== -1) {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? { ...mon, overall: AttemptState.Failed } : mon)));
            } else {
                setMonitorStates((prevMon) => (prevMon.map((mon, idx) => idx === monitorsBeingApplied[i] ? { ...mon, overall: AttemptState.Completed } : mon)));
            }
        }
        setOnErrorScreen(true);
    }
    async function applyEnable(focusedMonitorIdx: number, newMonitors: MutableRefObject<FrontendMonitor[]>): Promise<Attempt> {
        let newMonitorEnabledSetting = newMonitors.current[focusedMonitorIdx].outputs[0].enabled;
        let oldMonitorEnabledSetting = initialMonitors.current[focusedMonitorIdx].outputs[0].enabled;
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        console.log("apply enabled called on ", focusedMonitorIdx);
        if (newMonitorEnabledSetting !== oldMonitorEnabledSetting) {
            console.log("enable internal called");
            await invoke<number>("set_enabled", {
                xid: newMonitors.current[focusedMonitorIdx].outputs[0].xid,
                enabled: newMonitorEnabledSetting
            }).then(async (newCrtc) => {
                if (await promptUserToUndo()) {
                    newMonitors.current = [...resetFunctions.current.enable!(newMonitors.current, focusedMonitorIdx, oldMonitorEnabledSetting)];
                    await invoke("set_enabled", {
                        xid: initialMonitors.current[focusedMonitorIdx].outputs[0].xid,
                        enabled: oldMonitorEnabledSetting
                    }).then(async (_newCrtc) => {
                        await applyPosition(focusedMonitorIdx, newMonitors, true);
                        await applyRotation(focusedMonitorIdx, newMonitors, true)
                        await applyMode(focusedMonitorIdx, newMonitors, true)
                        output = { state: AttemptState.Undone, reason: "" };
                    });
                }
                else {
                    if (!newMonitorEnabledSetting) {
                        initialMonitors.current[focusedMonitorIdx].outputs[0].enabled = false;
                        initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.xid = 0;
                        initialMonitors.current[focusedMonitorIdx].x = 0;
                        initialMonitors.current[focusedMonitorIdx].y = 0;
                        initialMonitors.current[focusedMonitorIdx].outputs[0].rotation = Rotation.Normal;
                        initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.width = initialMonitors.current[focusedMonitorIdx].widthPx;
                        initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.height = initialMonitors.current[focusedMonitorIdx].heightPx;

                    } else {
                        /*
                        crtc.mode = mode.xid;
                        crtc.width = mode.width;
                        crtc.height = mode.height;
                        */
                        newMonitors.current = [...resetFunctions.current.setCrtc!(newMonitors.current, focusedMonitorIdx, newCrtc)];
                        let prefMode = initialMonitors.current[focusedMonitorIdx].outputs[0].preferredModes[0];
                        initialMonitors.current[focusedMonitorIdx].outputs[0].enabled = true;
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

    async function applyRotation(focusedMonitorIdx: number, newMonitors: MutableRefObject<FrontendMonitor[]>, forced: boolean): Promise<Attempt> {
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        console.log("apply rotation called on ", focusedMonitorIdx);
        if (forced || !(newMonitors.current[focusedMonitorIdx].outputs[0].rotation == initialMonitors.current[focusedMonitorIdx].outputs[0].rotation)) {
            console.log("rotation internal called");
            await invoke("set_rotation", {
                outputCrtc: newMonitors.current[focusedMonitorIdx].outputs[0].crtc,
                rotation: newMonitors.current[focusedMonitorIdx].outputs[0].rotation
            }).then(async () => {
                if (!forced && await promptUserToUndo()) {
                    newMonitors.current = [...resetFunctions.current.rotation!(newMonitors.current, focusedMonitorIdx)];

                    await invoke("set_rotation", {
                        outputCrtc: initialMonitors.current[focusedMonitorIdx].outputs[0].crtc,
                        rotation: initialMonitors.current[focusedMonitorIdx].outputs[0].rotation
                    });


                    output = { state: AttemptState.Undone, reason: "" };
                } else {
                    initialMonitors.current[focusedMonitorIdx].outputs[0].rotation = newMonitors.current[focusedMonitorIdx].outputs[0].rotation;
                    output = { state: AttemptState.Completed, reason: "" };

                }
            }).catch((reason) => {
                output = { state: AttemptState.Failed, reason: reason };
            });
        }
        return output;
    }
    async function applyPosition(focusedMonitorIdx: number, newMonitors: MutableRefObject<FrontendMonitor[]>, forced: boolean): Promise<Attempt> {
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        console.log("position function called");
        if (forced || !(newMonitors.current[focusedMonitorIdx].x === initialMonitors.current[focusedMonitorIdx].x
            && newMonitors.current[focusedMonitorIdx].y === initialMonitors.current[focusedMonitorIdx].y)) {
            console.log("positions internal called");

            await invoke("set_position", {
                outputCrtc: newMonitors.current[focusedMonitorIdx].outputs[0].crtc,
                x: newMonitors.current[focusedMonitorIdx].x.toFixed(0),
                y: newMonitors.current[focusedMonitorIdx].y.toFixed(0)
            }).then(async () => {
                if (!forced && await promptUserToUndo()) {
                    console.log("internals of redo func called")
                    newMonitors.current = [...resetFunctions.current.position!(newMonitors.current, focusedMonitorIdx)];
                    console.log("output:", newMonitors.current[focusedMonitorIdx].outputs[0].crtc, ",x:", newMonitors.current[focusedMonitorIdx].x, ",y:", newMonitors.current[focusedMonitorIdx].y)
                    await invoke("set_position", {
                        outputCrtc: newMonitors.current[focusedMonitorIdx].outputs[0].crtc,
                        x: initialMonitors.current[focusedMonitorIdx].x.toFixed(0),
                        y: initialMonitors.current[focusedMonitorIdx].y.toFixed(0)
                    })
                    output = { state: AttemptState.Undone, reason: "" };
                } else {
                    initialMonitors.current[focusedMonitorIdx].x = newMonitors.current[focusedMonitorIdx].x;
                    initialMonitors.current[focusedMonitorIdx].y = newMonitors.current[focusedMonitorIdx].y;
                    output = { state: AttemptState.Completed, reason: "" };
                }
            }).catch((reason) => {
                output = { state: AttemptState.Failed, reason: reason };
            });
            console.log("initial4 x:" + initialMonitors.current[focusedMonitorIdx].x + ", initial y:" + initialMonitors.current[focusedMonitorIdx].y)
            console.log("cust4 x:" + newMonitors.current[focusedMonitorIdx].x + ", cust y:" + newMonitors.current[focusedMonitorIdx].y)
        }
        return output;
    }
    async function applyMode(focusedMonitorIdx: number, newMonitors: MutableRefObject<FrontendMonitor[]>, forced: boolean): Promise<Attempt> {
        let output: Attempt = { state: AttemptState.Unchanged, reason: "" };
        let oldMode = initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!;
        let newMode = newMonitors.current[focusedMonitorIdx].outputs[0].currentMode!;
        console.log("apply mode called on ", focusedMonitorIdx);
        if (forced || newMode.xid !== oldMode.xid) {
            console.log("mode internal called");
            await invoke("set_mode", {
                outputCrtc: newMonitors.current[focusedMonitorIdx].outputs[0].crtc,
                modeXid: newMode.xid,
                modeHeight: newMode.height,
                modeWidth: newMode.width
            }).then(async () => {
                if (!forced && await promptUserToUndo()) {
                    await invoke("set_mode", {
                        outputCrtc: newMonitors.current[focusedMonitorIdx].outputs[0].crtc,
                        modeXid: oldMode.xid,
                        modeHeight: oldMode.height,
                        modeWidth: oldMode.width,
                    });
                    newMonitors.current = [...resetFunctions.current.mode!(newMonitors.current, focusedMonitorIdx)];
                    output = { state: AttemptState.Undone, reason: "" };
                } else {
                    initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode! = newMonitors.current[focusedMonitorIdx].outputs[0].currentMode!;
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
                <div className="errorTableContainer">
                    <table className="errorTable">
                        <tbody>
                            {failList.current.map((err) => (
                                <tr key={err.monitorIdx + err.settingName}>
                                    <td>Failed to apply {err.settingName} on monitor {initialMonitors.current[err.monitorIdx].name} because {err.reason}</td>
                                </tr>

                            ))}
                        </tbody>
                    </table>
                </div>
                <button className="finishButton" onClick={() => { setShowPopup(false) }}>Finish</button>
            </div>
        </div>
        :

        <div className="popup" style={{ display: showPopup ? "block" : "none" }}>
            <div className="popupContentsContainer" >
                <h1 className="popupTitle">Applying Settings</h1>
                <div className="monitorStatesContainer">
                    {monitorsBeingChangedState.map((monIdx) => (<div key={initialMonitors.current[monIdx].name} className="monitorState" >
                        <h2 id={monitorStates[monIdx].overall}>{initialMonitors.current[monIdx].name}</h2>
                        <hr />
                        <h4 id={monitorStates[monIdx].enabled} >Enabled:{monitorStates[monIdx].enabled}</h4>
                        <h4 id={monitorStates[monIdx].position} >Position:{monitorStates[monIdx].position}</h4>
                        <h4 id={monitorStates[monIdx].rotaiton} >Rotation:{monitorStates[monIdx].rotaiton}</h4>
                        <h4 id={monitorStates[monIdx].mode} >Mode:{monitorStates[monIdx].mode}</h4>
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