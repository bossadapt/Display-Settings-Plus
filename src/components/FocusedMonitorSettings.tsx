import { Dispatch, MutableRefObject, SetStateAction, useState } from "react";
import { customSelectTheme, FrontendMonitor, Mode, point, Rotation } from "../globalValues";
import "./FocusedMonitorSettings.css";
import { Application, Renderer } from "pixi.js";
import Select from "react-select";
import { invoke } from "@tauri-apps/api/core";
interface FocusedMonitorSettingsProps {
    focusedMonitorIdx: number;
    monitorScale: number;
    screenDragOffsetTotal: MutableRefObject<point>;
    freeHandPositionCanvas: MutableRefObject<Application<Renderer> | null>
    customMonitors: FrontendMonitor[];
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
}
export const FocusedMonitorSettings: React.FC<FocusedMonitorSettingsProps> = (
    { monitorScale, screenDragOffsetTotal, freeHandPositionCanvas, focusedMonitorIdx, customMonitors, initialMonitors, setMonitors }) => {

    //Enable
    ///used to disable the rest of the options:

    const monitorEnabled = customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid !== 0;
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
                                            ? { ...out.currentMode, xid: 0 }  // Ensure currentMode is not undefined
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
    function applyPosition() {
        //TODO: Normalize the values before passing
        if (!(customMonitors[focusedMonitorIdx].x == initialMonitors.current[focusedMonitorIdx].x
            && customMonitors[focusedMonitorIdx].y == initialMonitors.current[focusedMonitorIdx].y))
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
        if (rotation && prevRotation !== rotation) {
            //If this  is going to make the monitor sideways or return it from it
            //TODO: dont make it relative, jsut make it so it cusomized per perspective
            if ((rotation == Rotation.Normal && prevRotation == Rotation.Left) ||
                (rotation == Rotation.Left && prevRotation == Rotation.Normal) ||
                (rotation == Rotation.Left && prevRotation == Rotation.Inverted) ||
                (rotation == Rotation.Inverted && prevRotation == Rotation.Left) ||
                (rotation == Rotation.Right && prevRotation == Rotation.Inverted) ||
                (rotation == Rotation.Inverted && prevRotation == Rotation.Right) ||
                (rotation == Rotation.Right && prevRotation == Rotation.Normal) ||
                (rotation == Rotation.Normal && prevRotation == Rotation.Right)
            ) {

                //switch width and height in both states
                //TODO: make it look more legit and upscale each of the children too
                freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].width = customMonitors[focusedMonitorIdx].heightPx / monitorScale;
                freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].height = customMonitors[focusedMonitorIdx].widthPx / monitorScale;

                setMonitors((mons) =>
                    mons.map((curMon, idx) =>
                        idx === focusedMonitorIdx
                            ? { ...curMon, widthPx: curMon.heightPx, heightPx: curMon.widthPx }
                            : curMon
                    )
                );

            }
            setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
                ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, rotation: rotation } : out)) } : curMon)));
        }
    }
    function applyRotation() {
        //TODO: Normalize the values before passing
        if (!(customMonitors[focusedMonitorIdx].outputs[0].rotation == initialMonitors.current[focusedMonitorIdx].outputs[0].rotation)) {
            invoke("set_rotation", {
                xid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                rotation: customMonitors[focusedMonitorIdx].outputs[0].rotation
            }).then(() => {
                initialMonitors.current[focusedMonitorIdx].outputs[0].rotation = customMonitors[focusedMonitorIdx].outputs[0].rotation;
                console.log("SET NEW MONITOR POSITION");
            }).catch((reason) => {
                //TODO:  handle error

                console.log("Primary not properly set:", reason);
            });
        }
    }
    function resetRotation() {
        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, rotation: initialMonitors.current[idx].outputs[0].rotation } : out)) } : curMon)));
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
    //TODO: make the reset aand set not make the freehand text blurry(scale properly)
    function changeModePreset(newVal: Mode | undefined) {
        if (newVal) {
            setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
                ? { ...curMon, widthPx: newVal.width, heightMm: newVal.height, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, currentMode: newVal } : out)) } : curMon)));

        }
        if (freeHandPositionCanvas.current) {
            freeHandPositionCanvas.current.stage.children[focusedMonitorIdx].width = newVal!.width / monitorScale;
            freeHandPositionCanvas.current.stage.children[focusedMonitorIdx].height = newVal!.height / monitorScale;

        }
    }
    function resetModePreset() {
        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, widthPx: initialMonitors.current[focusedMonitorIdx].widthPx, heightPx: initialMonitors.current[focusedMonitorIdx].heightPx, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, currentMode: initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode } : out)) } : curMon)));

        if (freeHandPositionCanvas.current) {
            freeHandPositionCanvas.current.stage.children[focusedMonitorIdx].width = initialMonitors.current[focusedMonitorIdx].widthPx / monitorScale;
            freeHandPositionCanvas.current.stage.children[focusedMonitorIdx].height = initialMonitors.current[focusedMonitorIdx].heightPx / monitorScale;

        }
    }
    //TODO: if it  gets stuck it forces you to disable the monitor and restart it.
    //TODO: fix the snapping when scaled down /rotated
    function applyModePreset() {
        if (!(customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid == initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid)) {
            invoke("set_mode", {
                outputXid: customMonitors[focusedMonitorIdx].outputs[0].xid,
                modeXid: customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid
            }).then(() => {
                initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!.xid = customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid;
                console.log("SET NEW MODE");
                console.log("xidSet:", customMonitors[focusedMonitorIdx].outputs[0].currentMode!.xid);
            }).catch((reason) => {
                //TODO:  handle error

                console.log("Primary not properly set:", reason);
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
                <input type="checkbox" onChange={undefined} checked={monitorEnabled} onClick={toggleEnable}></input>
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