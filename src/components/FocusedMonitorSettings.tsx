import { Dispatch, MutableRefObject, SetStateAction, useEffect, useState } from "react";
import { customSelectTheme, FrontendMonitor, Mode, point, Rotation } from "../globalValues";
import "./FocusedMonitorSettings.css";
import { Application, Renderer } from "pixi.js";
import Select from "react-select";
import { invoke } from "@tauri-apps/api/core";
import { ResetFunctions } from "./LoadedScreen";
import { currentMonitor } from "@tauri-apps/api/window";
interface FocusedMonitorSettingsProps {
    focusedMonitorIdx: number;
    monitorScale: number;
    screenDragOffsetTotal: MutableRefObject<point>;
    freeHandPositionCanvas: MutableRefObject<Application<Renderer> | null>;
    customMonitors: FrontendMonitor[];
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
    rerenderMonitorsContainerRef: MutableRefObject<Function | null>;
    resetFunctions: MutableRefObject<ResetFunctions>;
}
export const FocusedMonitorSettings: React.FC<FocusedMonitorSettingsProps> = (
    { monitorScale, screenDragOffsetTotal, freeHandPositionCanvas, focusedMonitorIdx, customMonitors, initialMonitors, setMonitors, rerenderMonitorsContainerRef, resetFunctions }) => {

    //if there are any size changes, then the monitors need to rerendered without affecting the order integrity or stretching
    useEffect(() => {
        if (rerenderMonitorsContainerRef.current) {
            console.log(customMonitors);
            rerenderMonitorsContainerRef.current(customMonitors);
        }
    }, [customMonitors[focusedMonitorIdx].outputs[0].currentMode!.width, customMonitors[focusedMonitorIdx].outputs[0].rotation]);
    useEffect(() => {
        resetFunctions.current.enable = toggleEnable;
        resetFunctions.current.position = resetPosition;
        resetFunctions.current.rotation = resetRotation;
        resetFunctions.current.mode = resetModePreset;
    }, []);
    //Enable
    ///used to disable the rest of the options:

    const monitorEnabled = customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0;
    function toggleEnable(focusedMonitorIdx: number) {
        console.log("button pressed");
        if (!monitorEnabled) {
            console.log("enabled");
            //updating page state
            setMonitors((monList) =>
                monList.map((mon, idx) => (
                    idx === focusedMonitorIdx
                        ? {
                            ...mon,
                            x: initialMonitors.current[focusedMonitorIdx].x,
                            y: initialMonitors.current[focusedMonitorIdx].y,
                            outputs: mon.outputs.map((out, idx) =>
                                idx === 0
                                    ? {
                                        ...out,
                                        rotation: initialMonitors.current[focusedMonitorIdx].outputs[0].rotation,
                                        currentMode: out.currentMode
                                            ? {
                                                ...out.currentMode,
                                                width: initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.width,
                                                height: initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.height,
                                                //if the initial config's mode was disabled, set it to the pefered mode
                                                xid: initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0 ? initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid : initialMonitors.current[focusedMonitorIdx].outputs[0].preferredModes[0].xid
                                            }  // Ensure currentMode is not undefined
                                            : undefined  // Preserve undefined if there's no currentMode
                                    }
                                    : out
                            )
                        }
                        : mon
                ))
            );
            //updating freehand state, setting them visable
            if (freeHandPositionCanvas.current) {
                freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].eventMode = 'static';
                freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].alpha = 1;
                freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].x = initialMonitors.current[focusedMonitorIdx].x;
                freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].y = initialMonitors.current[focusedMonitorIdx].y;
            } else {
                console.log("stage not defined")
            }
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
            setMonitors((monList) =>
                monList.map((mon, idx) => (
                    idx === focusedMonitorIdx
                        ? {
                            ...mon,
                            x: 0,
                            y: 0,
                            outputs: mon.outputs.map((out, idx) =>
                                idx === 0
                                    ? {
                                        ...out,
                                        rotation: Rotation.Normal,
                                        currentMode: out.currentMode

                                            ? {
                                                ...out.currentMode,
                                                width: initialMonitors.current[focusedMonitorIdx].widthPx,
                                                height: initialMonitors.current[focusedMonitorIdx].heightPx,
                                                xid: 0
                                            }  // Ensure currentMode is not undefined
                                            : undefined  // Preserve undefined if there's no currentMode
                                    }
                                    : out
                            )
                        }
                        : mon
                ))
            );
            //updating freehand state, setting them fully transparent
            freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].eventMode = 'none';
            freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].alpha = 0;
            freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].x = 0;
            freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].y = 0;
        }
    }
    //POSITIONS
    function setPositionX(x: number) {
        x = Math.round(x);
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
        y = Math.round(y);
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

    function resetPosition(focusedMonitorIdx: number) {
        console.log("POSITIONS RESET CALLED :", customMonitors[focusedMonitorIdx]);
        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, x: initialMonitors.current[idx].x, y: initialMonitors.current[idx].y } : curMon)));
        if (freeHandPositionCanvas.current) {
            freeHandPositionCanvas.current.stage.children[focusedMonitorIdx].y = initialMonitors.current[focusedMonitorIdx].y / monitorScale + screenDragOffsetTotal.current.y;
            freeHandPositionCanvas.current.stage.children[focusedMonitorIdx].x = initialMonitors.current[focusedMonitorIdx].x / monitorScale + screenDragOffsetTotal.current.x;
        }
        console.log("positions to :", initialMonitors.current[focusedMonitorIdx]);
    }





    //ROTATION
    const rotationOptions = [{ value: Rotation.Normal, label: 'Normal' },
    { value: Rotation.Left, label: 'Left' },
    { value: Rotation.Inverted, label: 'Inverted' },
    { value: Rotation.Right, label: 'Right' }];
    //TODO: properly handle rotations such as left entering the program
    function changeRotation(rotation: Rotation | undefined) {
        let prevRotation = customMonitors[focusedMonitorIdx].outputs[0].rotation;

        //correlates to sizes
        if (rotation) {
            if ((rotation == Rotation.Normal || rotation === Rotation.Inverted) && (prevRotation !== Rotation.Normal && prevRotation !== Rotation.Inverted)
            ) {
                console.log("width and height changed to original state");
                setMonitors((mons) =>
                    mons.map((curMon, idx) =>
                    (idx === focusedMonitorIdx
                        ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, rotation: rotation, currentMode: { ...out.currentMode!, width: curMon.widthPx, height: curMon.heightPx } } : out)) }
                        : curMon)
                    )
                );
                // rerenderMonitorsContainerRef.current!();
            } else if ((rotation == Rotation.Left || rotation === Rotation.Right) && (prevRotation !== Rotation.Left && prevRotation !== Rotation.Right)

            ) {
                console.log("width and height changed to a sideways state");
                setMonitors((mons) =>
                    mons.map((curMon, idx) =>
                    (idx === focusedMonitorIdx
                        ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, rotation: rotation, currentMode: { ...out.currentMode!, width: curMon.heightPx, height: curMon.widthPx } } : out)) }
                        : curMon)
                    )
                );
                console.log("ideal new Width:,", customMonitors[focusedMonitorIdx].heightPx, "new Height:", customMonitors[focusedMonitorIdx].widthPx);
                // rerenderMonitorsContainerRef.current!();
            } else if (rotation != prevRotation) {
                //handling changing the state for things that dont need to flip 
                setMonitors((mons) =>
                    mons.map((curMon, idx) =>
                    (idx === focusedMonitorIdx
                        ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, rotation: rotation } : out)) }
                        : curMon)
                    )
                );
            }
            console.log("new Width:,", customMonitors[focusedMonitorIdx].outputs[0].currentMode!.width, "new Height:", customMonitors[focusedMonitorIdx].outputs[0].currentMode!.height);



        }
    }

    function resetRotation(focusedMonitorIdx: number) {
        console.log("Rotation RESET CALLED :", customMonitors[focusedMonitorIdx]);

        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? {
                ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? {
                    ...out, rotation: initialMonitors.current[idx].outputs[0].rotation,
                    currentMode: {
                        ...out.currentMode!,
                        height: initialMonitors.current[idx].outputs[0].currentMode!.height,
                        width: initialMonitors.current[idx].outputs[0].currentMode!.width
                    }
                } : out))
            } : curMon)));
    }





    //MODE
    function setFocusedModeRatio(newRatio: String) {
        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, name: newRatio.toString() } : out)) } : curMon)));
        let futureAvailableModes = initialMonitors.current[focusedMonitorIdx].outputs[0].modes.filter((mode) => (mode.name === newRatio)).sort((a, b) => b.rate - a.rate);
        changeModePreset(futureAvailableModes[0]);

    }
    const modeRatioOptions = [...new Set(initialMonitors.current[focusedMonitorIdx].outputs[0].modes.map(mode => (mode.name)))].map(uniqueRatios => ({ value: uniqueRatios, label: uniqueRatios }));
    const modeFPSOptions = initialMonitors.current[focusedMonitorIdx].outputs[0].modes.filter((mode) => (mode.name === customMonitors[focusedMonitorIdx].outputs[0].currentMode!.name)).sort((a, b) => b.rate - a.rate).map((mode) => ({ value: mode, label: mode.rate.toFixed(5) }))
    function changeModePreset(newVal: Mode | undefined) {
        if (newVal) {
            if (customMonitors[focusedMonitorIdx].outputs[0].rotation == Rotation.Inverted || customMonitors[focusedMonitorIdx].outputs[0].rotation == Rotation.Normal) {
                setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
                    ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, currentMode: newVal } : out)) } : curMon)));
            } else {
                setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
                    ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, currentMode: { ...newVal, width: newVal.height, height: newVal.width } } : out)) } : curMon)));
            }

        }
    }
    function resetModePreset(focusedMonitorIdx: number) {
        console.log("RESET MODE PRESET :", customMonitors[focusedMonitorIdx]);

        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, currentMode: initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode } : out)) } : curMon)));
    }

    //TODO: make RESET stick to the right side of the screen for each of the fields
    return (<div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Enabled:</h2>
            </div>
            <div className="settingsEditorContainer">
                <label>
                    <input type="checkbox" checked={monitorEnabled} onChange={() => { toggleEnable(focusedMonitorIdx) }} />
                    <div className="toggle"></div>
                </label>
            </div>
        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Position:</h2>
            </div>
            <div className="settingsEditorContainer">
                <h2 style={{ marginTop: "auto", marginBottom: "auto", marginLeft: "-5px" }}>X:</h2>
                <input disabled={!monitorEnabled} type="number" value={customMonitors[focusedMonitorIdx].x} onChange={(eve) => setPositionX(Number(eve.target.value))} />
                <h2 style={{ marginTop: "auto", marginBottom: "auto", marginLeft: "10px" }}>Y:</h2>
                <input disabled={!monitorEnabled} type="number" value={customMonitors[focusedMonitorIdx].y} onChange={(eve) => setPositionY(Number(eve.target.value))} />
            </div>
            <button className="resetButton" disabled={!monitorEnabled} onClick={() => { resetPosition(focusedMonitorIdx) }}>Reset</button>

        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Rotation:</h2>
            </div>
            <div className="settingsEditorContainer">
                <Select isDisabled={!monitorEnabled} options={rotationOptions} onChange={(eve) => { changeRotation(eve?.value) }} value={rotationOptions.find((rot) =>
                    (rot.value === customMonitors[focusedMonitorIdx].outputs[0].rotation)
                )} theme={customSelectTheme}></Select>
            </div>
            <button className="resetButton" disabled={!monitorEnabled} onClick={() => { resetRotation(focusedMonitorIdx) }}>Reset</button>

        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Mode:</h2>
            </div>
            <div className="settingsEditorContainer">
                <h2 style={{ marginLeft: "-5px", marginTop: "auto", marginBottom: "auto" }}>Ratio:</h2>
                <Select isDisabled={!monitorEnabled} options={modeRatioOptions} onChange={(eve) => {
                    if (eve) {
                        console.log("set eve.label to:", eve.label);
                        setFocusedModeRatio(eve.label)
                    }
                }} value={modeRatioOptions.find((option) => {
                    return option.value === customMonitors[focusedMonitorIdx].outputs[0].currentMode!.name;
                })} theme={customSelectTheme}></Select>
                <h2 style={{ marginLeft: "10px", marginTop: "auto", marginBottom: "auto" }}>Rate:</h2>
                <Select isDisabled={!monitorEnabled} options={modeFPSOptions} onChange={(eve) => changeModePreset(eve?.value)} value={modeFPSOptions.find((option) => {
                    // console.log("RAN Rate VALUE CODE:")
                    // console.log(option.value);
                    // console.log(customMonitors[focusedMonitorIdx].outputs[0].currentMode);
                    // console.log(option.value === customMonitors[focusedMonitorIdx].outputs[0].currentMode);
                    return option.value.xid === customMonitors[focusedMonitorIdx].outputs[0].currentMode?.xid;
                })} theme={customSelectTheme}></Select>
            </div>
            <button className="resetButton" disabled={!monitorEnabled} onClick={() => { resetModePreset(focusedMonitorIdx) }}>Reset</button>

        </div>

    </div>);
};
export default FocusedMonitorSettings;