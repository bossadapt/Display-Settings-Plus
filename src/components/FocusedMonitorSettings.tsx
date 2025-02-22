import { Dispatch, MutableRefObject, SetStateAction, useEffect } from "react";
import { customSelectTheme, FrontendMonitor, Mode, point, Rotation } from "../globalValues";
import "./FocusedMonitorSettings.css";
import { Application, Renderer } from "pixi.js";
import Select from "react-select";
import { focusedSettingsFunctions } from "./LoadedScreen";
interface FocusedMonitorSettingsProps {
    focusedMonitorIdx: number;
    customMonitors: FrontendMonitor[];
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
    rerenderMonitorsContainerRef: MutableRefObject<((newMonitors: FrontendMonitor[]) => void) | null>;
    resetFunctions: MutableRefObject<focusedSettingsFunctions>;
}
export const FocusedMonitorSettings: React.FC<FocusedMonitorSettingsProps> = (
    { focusedMonitorIdx, customMonitors, initialMonitors, setMonitors, rerenderMonitorsContainerRef, resetFunctions }) => {

    //if there are any size changes, then the monitors need to rerendered without affecting the order integrity or stretching
    //MANUAL ATTEMPT
    useEffect(() => {
        console.log('rerender external called');
        if (rerenderMonitorsContainerRef.current) {
            console.log('rerender internal');
            console.log(customMonitors);
            rerenderMonitorsContainerRef.current(customMonitors);
        }
    }, [customMonitors]);
    useEffect(() => {
        resetFunctions.current.enable = setEnabled;
        resetFunctions.current.position = resetPosition;
        resetFunctions.current.rotation = resetRotation;
        resetFunctions.current.mode = resetModePreset;
        resetFunctions.current.setCrtc = setCrtc;
    }, [setEnabled, resetPosition, resetRotation, resetModePreset]);
    //Enable
    ///used to disable the rest of the options:
    function setEnabled(monitors: FrontendMonitor[], focusedMonitorIdx: number, enabled: boolean): FrontendMonitor[] {
        console.log("button enabled called");
        console.log(initialMonitors.current);
        console.log(customMonitors);
        if (enabled) {
            console.log("enabled");
            //updating page state
            monitors = monitors.map((mon, idx) => (
                idx === focusedMonitorIdx
                    ? {
                        ...mon,
                        x: initialMonitors.current[focusedMonitorIdx].x,
                        y: initialMonitors.current[focusedMonitorIdx].y,
                        outputs: mon.outputs.map((out, outIdx) =>
                            outIdx === 0
                                ? {
                                    ...out,
                                    enabled: true,
                                    rotation: initialMonitors.current[focusedMonitorIdx].outputs[0].rotation,
                                    currentMode: {
                                        ...out.currentMode,
                                        xid: initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid,
                                        width: initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.width,
                                        height: initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.height,
                                    }
                                }
                                : out
                        )
                    }
                    : mon
            ))
        } else {
            console.log("disabled");
            //what happens inside the xrandr library:
            /*
            self.x = 0;
            self.y = 0;
            self.mode = 0;
            self.rotation = Rotation::Normal;
            self.outputs.clear();
            */
            monitors = monitors.map((mon, idx) => (
                idx === focusedMonitorIdx
                    ? {
                        ...mon,
                        x: 0,
                        y: 0,
                        outputs: mon.outputs.map((out, outIdx) =>
                            outIdx === 0
                                ? {
                                    ...out,
                                    rotation: Rotation.Normal,
                                    enabled: false,
                                    currentMode: {
                                        ...out.currentMode,
                                        width: initialMonitors.current[focusedMonitorIdx].widthPx,
                                        height: initialMonitors.current[focusedMonitorIdx].heightPx,
                                        xid: 0
                                    }
                                }
                                : out
                        )
                    }
                    : mon
            ));
        }
        setMonitors(monitors);
        return monitors;
    }
    function setCrtc(monitors: FrontendMonitor[], focusedMonitorIdx: number, newCrtc: number): FrontendMonitor[] {
        monitors = monitors.map((curMon, idx) =>
            idx === focusedMonitorIdx
                ? { ...curMon, outputs: curMon.outputs.map((out, outIdx) => (outIdx == 0 ? { ...out, crtc: newCrtc } : out)) }
                : curMon
        )
        setMonitors(monitors);
        initialMonitors.current[focusedMonitorIdx].outputs[0].crtc = newCrtc;
        return monitors;
    }
    //POSITIONS
    function setPositionX(x: number) {
        x = Math.trunc(x);
        setMonitors((mons) =>
            mons.map((curMon, idx) =>
                idx === focusedMonitorIdx
                    ? { ...curMon, x: x }
                    : curMon
            )
        );
    }
    function setPositionY(y: number) {
        y = Math.trunc(y);
        setMonitors((mons) =>
            mons.map((curMon, idx) =>
                idx === focusedMonitorIdx
                    ? { ...curMon, y }
                    : curMon
            )
        );
    }

    function resetPosition(monitors: FrontendMonitor[], focusedMonitorIdx: number): FrontendMonitor[] {
        console.log("Position reset called");
        console.log(initialMonitors.current);
        console.log(customMonitors);
        monitors = monitors.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, x: initialMonitors.current[idx].x, y: initialMonitors.current[idx].y } : curMon))
        setMonitors(monitors);
        console.log("positions to :", initialMonitors.current[focusedMonitorIdx]);
        return monitors;
    }





    //ROTATION
    const rotationOptions = [{ value: Rotation.Normal, label: 'Normal' },
    { value: Rotation.Left, label: 'Left' },
    { value: Rotation.Inverted, label: 'Inverted' },
    { value: Rotation.Right, label: 'Right' }];
    function changeRotation(newRotation: Rotation | undefined) {
        let prevRotation = customMonitors[focusedMonitorIdx].outputs[0].rotation;

        //correlates to sizes
        if (newRotation && newRotation !== prevRotation) {
            setMonitors((mons) =>
                mons.map((curMon, idx) =>
                (idx === focusedMonitorIdx
                    ? { ...curMon, outputs: curMon.outputs.map((out, outIdx) => (outIdx === 0 ? { ...out, rotation: newRotation } : out)) }
                    : curMon)
                )
            );
            if (rerenderMonitorsContainerRef.current)
                rerenderMonitorsContainerRef.current(customMonitors)
        }
    }

    function resetRotation(monitors: FrontendMonitor[], focusedMonitorIdx: number): FrontendMonitor[] {
        console.log("reset rotation called");
        console.log(initialMonitors.current);
        console.log(customMonitors);
        monitors = monitors.map((curMon, idx) => (idx === focusedMonitorIdx
            ? {
                ...curMon, outputs: curMon.outputs.map((out, outIdx) => (outIdx === 0 ? {
                    ...out, rotation: initialMonitors.current[focusedMonitorIdx].outputs[0].rotation,
                } : out))
            } : curMon));
        setMonitors(monitors);
        return monitors;
    }





    //MODE
    function setFocusedModeRatio(newRatio: String) {
        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, outputs: curMon.outputs.map((out, outIdx) => (outIdx === 0 ? { ...out, name: newRatio.toString() } : out)) } : curMon)));
        let futureAvailableModes = initialMonitors.current[focusedMonitorIdx].outputs[0].modes.filter((mode) => (mode.name === newRatio)).sort((a, b) => b.rate - a.rate);
        changeModePreset(futureAvailableModes[0]);

    }
    const modeRatioOptions = [...new Set(initialMonitors.current[focusedMonitorIdx].outputs[0].modes.map(mode => (mode.name)))].map(uniqueRatios => ({ value: uniqueRatios, label: uniqueRatios }));
    const modeFPSOptions = initialMonitors.current[focusedMonitorIdx].outputs[0].modes
        .filter((mode) => (mode.name === customMonitors[focusedMonitorIdx].outputs[0].currentMode!.name))
        .sort((a, b) => b.rate - a.rate)
        .map((mode) => ({ value: mode, label: mode.rate.toFixed(5) }))
    function changeModePreset(newVal: Mode | undefined) {
        if (newVal && newVal !== customMonitors[focusedMonitorIdx].outputs[0].currentMode) {
            setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
                ? { ...curMon, outputs: curMon.outputs.map((out, outIdx) => (outIdx === 0 ? { ...out, currentMode: newVal } : out)) } : curMon)));
        }
    }
    function resetModePreset(monitors: FrontendMonitor[], focusedMonitorIdx: number): FrontendMonitor[] {
        console.log("mode reset called called");
        console.log(initialMonitors.current);
        console.log(customMonitors);
        monitors = monitors.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, outputs: curMon.outputs.map((out, outIdx) => (outIdx === 0 ? { ...out, currentMode: initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode } : out)) } : curMon));
        setMonitors(monitors)
        if (rerenderMonitorsContainerRef.current)
            rerenderMonitorsContainerRef.current(customMonitors)
        return monitors
    }

    function resetAllFocused() {
        setMonitors((custMons) => (custMons.map((custMon, idx) => (idx === focusedMonitorIdx
            ? { ...initialMonitors.current[focusedMonitorIdx] } : custMon))));

    }
    return (<div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Enabled:</h2>
            </div>
            <div className="settingsEditorContainer">
                <label>
                    <input type="checkbox" checked={customMonitors[focusedMonitorIdx].outputs[0].enabled} onChange={() => { setEnabled(customMonitors, focusedMonitorIdx, !customMonitors[focusedMonitorIdx].outputs[0].enabled) }} />
                    <div className="toggle"></div>
                </label>
            </div>
            <button style={{ width: "95px" }} className="resetButton" disabled={!customMonitors[focusedMonitorIdx].outputs[0].enabled} onClick={resetAllFocused}>Reset<br></br>Monitor</button>

        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Position:</h2>
            </div>
            <div className="settingsEditorContainer">
                <h2 style={{ marginTop: "auto", marginBottom: "auto", marginLeft: "-10px" }}>X:</h2>
                <input disabled={!customMonitors[focusedMonitorIdx].outputs[0].enabled} type="number" value={customMonitors[focusedMonitorIdx].x} onChange={(eve) => setPositionX(Number(eve.target.value))} />
                <h2 style={{ marginTop: "auto", marginBottom: "auto", marginLeft: "10px" }}>Y:</h2>
                <input disabled={!customMonitors[focusedMonitorIdx].outputs[0].enabled} type="number" value={customMonitors[focusedMonitorIdx].y} onChange={(eve) => setPositionY(Number(eve.target.value))} />
            </div>
            <button className="resetButton" disabled={!customMonitors[focusedMonitorIdx].outputs[0].enabled} onClick={() => { resetPosition(customMonitors, focusedMonitorIdx) }}>Reset</button>

        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Rotation:</h2>
            </div>
            <div className="settingsEditorContainer">
                <Select isDisabled={!customMonitors[focusedMonitorIdx].outputs[0].enabled} options={rotationOptions} onChange={(eve) => { changeRotation(eve?.value) }} value={rotationOptions.find((rot) =>
                    (rot.value === customMonitors[focusedMonitorIdx].outputs[0].rotation)
                )} theme={customSelectTheme}></Select>
            </div>
            <button className="resetButton" disabled={!customMonitors[focusedMonitorIdx].outputs[0].enabled} onClick={() => { resetRotation(customMonitors, focusedMonitorIdx) }}>Reset</button>

        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Mode:</h2>
            </div>
            <div className="settingsEditorContainer">
                <h2 style={{ marginLeft: "-5px", marginTop: "auto", marginBottom: "auto" }}>Ratio:</h2>
                <Select isDisabled={!customMonitors[focusedMonitorIdx].outputs[0].enabled} options={modeRatioOptions} onChange={(eve) => {
                    if (eve) {
                        console.log("set eve.label to:", eve.label);
                        setFocusedModeRatio(eve.label)
                    }
                }} value={modeRatioOptions.find((option) => {
                    return option.value === customMonitors[focusedMonitorIdx].outputs[0].currentMode!.name;
                })} theme={customSelectTheme}></Select>
                <h2 style={{ marginLeft: "10px", marginTop: "auto", marginBottom: "auto" }}>Rate:</h2>
                <Select isDisabled={!customMonitors[focusedMonitorIdx].outputs[0].enabled} options={modeFPSOptions} onChange={(eve) => changeModePreset(eve?.value)} value={modeFPSOptions.find((option) => {
                    // console.log("RAN Rate VALUE CODE:")
                    // console.log(option.value);
                    // console.log(customMonitors[focusedMonitorIdx].outputs[0].currentMode);
                    // console.log(option.value === customMonitors[focusedMonitorIdx].outputs[0].currentMode);
                    return option.value.xid === customMonitors[focusedMonitorIdx].outputs[0].currentMode?.xid;
                })} theme={customSelectTheme}></Select>
            </div>
            <button className="resetButton" disabled={!customMonitors[focusedMonitorIdx].outputs[0].enabled} onClick={() => { resetModePreset(customMonitors, focusedMonitorIdx) }}>Reset</button>

        </div>

    </div>);
};
export default FocusedMonitorSettings;