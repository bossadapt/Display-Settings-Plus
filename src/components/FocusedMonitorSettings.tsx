import { Dispatch, MutableRefObject, SetStateAction, useState } from "react";
import { FrontendMonitor, Mode, point, Rotation } from "../globalInterfaces";
import "./FocusedMonitorSettings.css";
import { Application, BlendModeFilter, Renderer } from "pixi.js";
import Select, { SingleValue } from "react-select";
interface FocusedMonitorSettingsProps {
    focusedMonitorIdx: number;
    monitorScale: number;
    screenDragOffsetTotal: MutableRefObject<point>;
    freeHandPositionCanvas: MutableRefObject<Application<Renderer> | null>
    customMonitor: FrontendMonitor[];
    initialMonitors: FrontendMonitor[];
    setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
}
export const FocusedMonitorSettings: React.FC<FocusedMonitorSettingsProps> = ({ monitorScale, screenDragOffsetTotal, freeHandPositionCanvas, focusedMonitorIdx, customMonitor, initialMonitors, setMonitors }) => {


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
    function resetPosition() {
        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, x: initialMonitors[idx].x, y: initialMonitors[idx].y } : curMon)));
    }





    //ROTATION
    const rotationOptions = [{ value: Rotation.Normal, label: 'Normal' },
    { value: Rotation.Left, label: 'Left' },
    { value: Rotation.Inverted, label: 'Inverted' },
    { value: Rotation.Right, label: 'Right' }];
    function changeRotation(rotation: Rotation | undefined) {
        let prevRotation = customMonitor[focusedMonitorIdx].outputs[0].rotation;
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
                freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].width = customMonitor[focusedMonitorIdx].heightPx / 10;
                freeHandPositionCanvas.current!.stage.children[focusedMonitorIdx].height = customMonitor[focusedMonitorIdx].widthPx / 10;

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
    function resetRotation() {
        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, rotation: initialMonitors[idx].outputs[0].rotation } : out)) } : curMon)));
    }





    //MODE
    //TODO: make rate get reset to an available rate that works with the ratio
    //TODO: fix reset
    const [focusedModeRatio, setFocusedModeRation] = useState<String>(customMonitor[focusedMonitorIdx].outputs[0].name);
    const modeRatioOptions = [...new Set(initialMonitors[focusedMonitorIdx].outputs[0].modes.map(mode => (mode.name)))].map(uniqueRatios => ({ value: uniqueRatios, label: uniqueRatios }));
    const modeFPSOptions = initialMonitors[focusedMonitorIdx].outputs[0].modes.filter((mode) => (mode.name === focusedModeRatio)).sort((a, b) => b.rate - a.rate).map((mode) => ({ value: mode, label: mode.rate.toFixed(5) }))
    function changeModePreset(newVal: Mode | undefined) {
        if (newVal) {
            setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
                ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, currentMode: newVal } : out)) } : curMon)));
        }
    }
    function resetModePreset() {
        setMonitors((mons) => mons.map((curMon, idx) => (idx === focusedMonitorIdx
            ? { ...curMon, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, currentMode: initialMonitors[focusedMonitorIdx].outputs[0].currentMode } : out)) } : curMon)));

    }
    return (<div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Position:</h2>
            </div>
            <div className="settingsEditorContainer">
                <h2 style={{ marginTop: "auto", marginBottom: "auto" }}>X:</h2>
                <input type="number" value={customMonitor[focusedMonitorIdx].x} onChange={(eve) => setPositionX(Number(eve.target.value))} />
                <h2 style={{ marginTop: "auto", marginBottom: "auto", marginLeft: "15px" }}>Y:</h2>
                <input type="number" value={customMonitor[focusedMonitorIdx].y} onChange={(eve) => setPositionY(Number(eve.target.value))} />
                <button onClick={resetPosition}>Reset</button>
                <button>Apply</button>
            </div>
        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Rotation:</h2>
            </div>
            <div className="settingsEditorContainer">
                <Select options={rotationOptions} onChange={(eve) => { changeRotation(eve?.value) }} value={rotationOptions.find((rot) =>
                    (rot.value === customMonitor[focusedMonitorIdx].outputs[0].rotation)
                )} theme={(theme) => ({
                    ...theme, borderRadius: 0,
                    colors: {
                        ...theme.colors,
                        neutral0: 'black',
                        neutral70: 'black',
                        neutral80: 'white',
                        //primary == background
                        //hover over
                        primary25: 'hotpink',
                        primary50: 'pink',
                        primary60: 'black',
                        primary75: 'black',
                        //already selected background from dropdown
                        primary: 'hotpink',
                    },
                })}></Select>
                <button onClick={resetRotation}>Reset</button>
                <button>Apply</button>

            </div>
        </div>
        <div className="settingsContainer">
            <div className="settingsDescriptonContainer">
                <h2>Mode:</h2>
            </div>
            <div className="settingsEditorContainer">
                <h2 style={{ marginTop: "auto", marginBottom: "auto" }}>Ratio:</h2>
                <Select options={modeRatioOptions} onChange={(eve) => {
                    if (eve) {
                        setFocusedModeRation(eve.label)
                    }
                }} value={modeRatioOptions.find((option) => {
                    console.log(option.value);
                    console.log(customMonitor[focusedMonitorIdx].outputs[0].currentMode?.name);
                    console.log(option.value === customMonitor[focusedMonitorIdx].outputs[0].currentMode?.name);
                    return option.value === focusedModeRatio;
                })} theme={(theme) => ({
                    ...theme, borderRadius: 0,
                    colors: {
                        ...theme.colors,
                        neutral0: 'black',
                        neutral70: 'black',
                        neutral80: 'white',
                        //primary == background
                        //hover over
                        primary25: 'hotpink',
                        primary50: 'pink',
                        primary60: 'black',
                        primary75: 'black',
                        //already selected background from dropdown
                        primary: 'hotpink',
                    },
                })}></Select>
                <h2 style={{ marginTop: "auto", marginBottom: "auto" }}>Rate:</h2>
                <Select options={modeFPSOptions} onChange={(eve) => changeModePreset(eve?.value)} value={modeFPSOptions.find((option) => {
                    console.log(option.value);
                    console.log(customMonitor[focusedMonitorIdx].outputs[0].currentMode);
                    console.log(option.value === customMonitor[focusedMonitorIdx].outputs[0].currentMode);
                    return option.value.xid === customMonitor[focusedMonitorIdx].outputs[0].currentMode?.xid;
                })} theme={(theme) => ({
                    ...theme, borderRadius: 0,
                    colors: {
                        ...theme.colors,
                        neutral0: 'black',
                        neutral70: 'black',
                        neutral80: 'white',
                        //primary == background
                        //hover over
                        primary25: 'hotpink',
                        primary50: 'pink',
                        primary60: 'black',
                        primary75: 'black',
                        //already selected background from dropdown
                        primary: 'hotpink',
                    },
                })}></Select>
                <button onClick={resetModePreset}>Reset</button>
                <button>Apply</button>

            </div>
        </div>

    </div>);
};
export default FocusedMonitorSettings;