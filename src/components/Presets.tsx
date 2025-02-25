import { Dispatch, MutableRefObject, SetStateAction, useState } from "react";
import { FrontendMonitor, Preset } from "../globalValues";
import { invoke } from "@tauri-apps/api/core";
import "./Presets.css";
interface PresetsProps {
    presets: MutableRefObject<Preset[]>;
    customMonitors: FrontendMonitor[];
    setCustMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
    normalizePositionsRef: MutableRefObject<((customMonitors: FrontendMonitor[]) => FrontendMonitor[]) | null>;
    setShowSimplePopUp: Dispatch<SetStateAction<boolean>>;
    setSimplePopUpReason: Dispatch<SetStateAction<string>>;

}
export const Presets: React.FC<PresetsProps> = ({ presets, customMonitors, setCustMonitors, normalizePositionsRef, setShowSimplePopUp, setSimplePopUpReason }) => {
    const [focusedPresetIdx, setFocusedPresetIdx] = useState(-1);
    const [presetSearchTerm, setPresetSearchTerm] = useState("");
    //TODO: need add and delete button functionality
    function setFocusedPreset(presetSelected: number) {
        console.log("setFocus to " + presetSelected);
        let newMons: FrontendMonitor[] = [];
        for (let i = 0; i < customMonitors.length; i++) {
            // has the same xid and has the mode xid needed available
            let presetAttempt = presets.current[presetSelected].monitors.find(
                (presetMon) =>
                (customMonitors[i].outputs[0].xid === presetMon.outputs[0].xid &&
                    customMonitors[i].outputs[0].modes.find((mode) => (mode.xid === presetMon.outputs[0].currentMode.xid))));
            if (presetAttempt) {
                console.log("monitor number ", i, " was overwritten");
            }
            newMons.push(presetAttempt ? { ...presetAttempt } : customMonitors[i])
        }
        setCustMonitors(newMons);
        setFocusedPresetIdx(presetSelected);
    }
    function overwriteFocusedPreset() {
        if (focusedPresetIdx !== -1) {
            let newPreset = normalizePositionsRef.current ? normalizePositionsRef.current(customMonitors) : customMonitors;
            setShowSimplePopUp(true);
            setSimplePopUpReason("Overwriting Preset");
            invoke<FrontendMonitor[][]>("overwrite_preset", {
                idx: focusedPresetIdx,
                newPreset: newPreset
            }).then((_res) => {
                presets.current[focusedPresetIdx].monitors = customMonitors;
            }).catch((err) => {
                console.error(err);
            });
            setShowSimplePopUp(false);
        }
    }
    return (<div style={{ width: "20vw", height: "100%" }} >
        <div style={{ height: "12vh" }}>
            <h3 className="mini-titles">Presets</h3>
            <div style={{ display: "flex", flexDirection: "row" }}>
                <input className="presets-search-bar" type="text" value={presetSearchTerm} onChange={(eve) => { setPresetSearchTerm(eve.target.value) }} />
                <button className="presets-add-button">+</button>
            </div>
        </div>
        <div style={{ height: "37vh", overflowY: "scroll" }}>
            {presets.current.filter((preset) => (preset.name.includes(presetSearchTerm))).sort((a, b) => (a.name > b.name ? 1 : -1)).map((preset, idx) => (
                <div style={{ display: "flex", flexDirection: "row" }}>
                    <button style={{ width: "15vw" }} disabled={focusedPresetIdx === idx} onClick={() => setFocusedPreset(idx)}>{preset.name}</button>
                    <button style={{ width: "5vw" }}>X</button>
                </div>
            ))}
        </div>
        <button onClick={overwriteFocusedPreset}>Overwrite Preset</button>
    </div>);
}
export default Presets;