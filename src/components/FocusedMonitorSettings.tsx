import { Dispatch, MutableRefObject, SetStateAction, useEffect, useState } from "react";
import { customSelectTheme, FrontendMonitor, Mode, point, Rotation } from "../globalValues";
import "./FocusedMonitorSettings.css";
import { Application, Renderer } from "pixi.js";
import Select from "react-select";
import { invoke } from "@tauri-apps/api/core";
interface FocusedMonitorSettingsProps {
    focusedMonitorIdx: number;
    monitorScale: number;
    screenDragOffsetTotal: MutableRefObject<point>;
    freeHandPositionCanvas: MutableRefObject<Application<Renderer> | null>;
    customMonitors: FrontendMonitor[];
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
    rerenderMonitorsContainerRef: MutableRefObject<Function | null>;
}
export const FocusedMonitorSettings: React.FC<FocusedMonitorSettingsProps> = (
    { monitorScale, screenDragOffsetTotal, freeHandPositionCanvas, focusedMonitorIdx, customMonitors, initialMonitors, setMonitors, rerenderMonitorsContainerRef }) => {

    //if there are any size changes, then the monitors need to rerendered without affecting the order integrity or stretching
    useEffect(() => {
        if (rerenderMonitorsContainerRef.current) {
            console.log(customMonitors);
            rerenderMonitorsContainerRef.current(customMonitors);
        }
    }, [customMonitors[focusedMonitorIdx].outputs[0].currentMode!.width]);
    //Enable
    ///used to disable the rest of the options:

    const monitorEnabled = customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0;
    function applyEnable() {
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
            freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].x = 0;
            freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].y = 0;

            console.log("monitor disabled");
        }).catch((reason) => {
            //TODO:  handle error

            console.log("Enable not applied", reason);
        });

    }
    function toggleEnable() {
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
        }
    }
    //POSITIONS
    //TODO: only accepts whole numbers, round before sending
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
    function normalizePositions() {
        if (freeHandPositionCanvas.current) {
            let minOffsetY = Number.MAX_VALUE;
            let minOffsetX = Number.MAX_VALUE;
            //find the smallest offsets
            freeHandPositionCanvas.current.stage.children.forEach((mon) => {
                if (mon.x < minOffsetX) {
                    minOffsetX = mon.x;
                }
                if (mon.y < minOffsetY) {
                    minOffsetY = mon.y;
                }
            })
            if (minOffsetX == Number.MAX_VALUE) {
                //there are no monitors
                return;
            }
            //revert the offset to normalize
            let newMonitors = [...customMonitors];
            freeHandPositionCanvas.current.stage.children.forEach((mon, idx) => {
                mon.x -= minOffsetX;
                mon.y -= minOffsetY;
                newMonitors[idx].x = mon.x * monitorScale;
                newMonitors[idx].y = mon.y * monitorScale;
            });
            setMonitors(newMonitors);
            screenDragOffsetTotal.current.x = 0;
            screenDragOffsetTotal.current.y = 0;
        }
    }
    function applyPosition() {
        normalizePositions();
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
    function resetPosition() {
        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, x: initialMonitors.current[idx].x, y: initialMonitors.current[idx].y } : curMon)));
    }





    //ROTATION
    const rotationOptions = [{ value: Rotation.Normal, label: 'Normal' },
    { value: Rotation.Left, label: 'Left' },
    { value: Rotation.Inverted, label: 'Inverted' },
    { value: Rotation.Right, label: 'Right' }];
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
    function applyRotation() {
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
    function resetRotation() {
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
    //TODO: FIX BEING ABLE TO SET BACK THE RESOLUTION::: WORKS ONCE THEN BREAKS, might be xrandr issue
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
            setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
                ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, currentMode: newVal } : out)) } : curMon)));

        }
    }
    function resetModePreset() {
        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, currentMode: initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode } : out)) } : curMon)));
    }
    //TODO: if it  gets stuck it forces you to disable the monitor and restart it.
    function applyModePreset() {
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
    //TODO: make RESET stick to the right side of the screen for each of the fields
    return (<div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Enabled:</h2>
            </div>
            <div className="settingsEditorContainer">
                <label>
                    <input type="checkbox" checked={monitorEnabled} onChange={toggleEnable} />
                    <div className="toggle"></div>
                </label>
                <button onClick={applyEnable}>APPLY</button>
            </div>
        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Position:</h2>
            </div>
            <div className="settingsEditorContainer">
                <h2 style={{ marginTop: "auto", marginBottom: "auto" }}>X:</h2>
                <input disabled={!monitorEnabled} type="number" value={customMonitors[focusedMonitorIdx].x} onChange={(eve) => setPositionX(Number(eve.target.value))} />
                <h2 style={{ marginTop: "auto", marginBottom: "auto", marginLeft: "15px" }}>Y:</h2>
                <input disabled={!monitorEnabled} type="number" value={customMonitors[focusedMonitorIdx].y} onChange={(eve) => setPositionY(Number(eve.target.value))} />
                <button disabled={!monitorEnabled} onClick={resetPosition}>Reset</button>
                <button disabled={!monitorEnabled} onClick={applyPosition}>Apply</button>
            </div>
        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Rotation:</h2>
            </div>
            <div className="settingsEditorContainer">
                <Select isDisabled={!monitorEnabled} options={rotationOptions} onChange={(eve) => { changeRotation(eve?.value) }} value={rotationOptions.find((rot) =>
                    (rot.value === customMonitors[focusedMonitorIdx].outputs[0].rotation)
                )} theme={customSelectTheme}></Select>
                <button disabled={!monitorEnabled} onClick={resetRotation}>Reset</button>
                <button disabled={!monitorEnabled} onClick={applyRotation}>Apply</button>
            </div>
        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Mode:</h2>
            </div>
            <div className="settingsEditorContainer">
                <h2 style={{ marginTop: "auto", marginBottom: "auto" }}>Ratio:</h2>
                <Select isDisabled={!monitorEnabled} options={modeRatioOptions} onChange={(eve) => {
                    if (eve) {
                        console.log("set eve.label to:", eve.label);
                        setFocusedModeRatio(eve.label)
                    }
                }} value={modeRatioOptions.find((option) => {
                    return option.value === customMonitors[focusedMonitorIdx].outputs[0].currentMode!.name;
                })} theme={customSelectTheme}></Select>
                <h2 style={{ marginTop: "auto", marginBottom: "auto" }}>Rate:</h2>
                <Select isDisabled={!monitorEnabled} options={modeFPSOptions} onChange={(eve) => changeModePreset(eve?.value)} value={modeFPSOptions.find((option) => {
                    // console.log("RAN Rate VALUE CODE:")
                    // console.log(option.value);
                    // console.log(customMonitors[focusedMonitorIdx].outputs[0].currentMode);
                    // console.log(option.value === customMonitors[focusedMonitorIdx].outputs[0].currentMode);
                    return option.value.xid === customMonitors[focusedMonitorIdx].outputs[0].currentMode?.xid;
                })} theme={customSelectTheme}></Select>
                <button disabled={!monitorEnabled} onClick={resetModePreset}>Reset</button>
                <button disabled={!monitorEnabled} onClick={applyModePreset}>Apply</button>
            </div>
        </div>

    </div>);
};
export default FocusedMonitorSettings;