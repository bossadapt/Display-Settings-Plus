import { Dispatch, MutableRefObject, SetStateAction, useState } from "react";
import { FrontendMonitor, Preset } from "../globalValues";
import { invoke } from "@tauri-apps/api/core";
import "./Presets.css";
import { SingleError } from "./SingleErrorPopUp";
interface PresetsProps {
    presets: Preset[];
    setPresets: Dispatch<SetStateAction<Preset[]>>;
    customMonitors: FrontendMonitor[];
    setCustMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
    normalizePositionsRef: MutableRefObject<((customMonitors: FrontendMonitor[]) => FrontendMonitor[]) | null>;
    setShowSimplePopUp: Dispatch<SetStateAction<boolean>>;
    setSimplePopUpReason: Dispatch<SetStateAction<string>>;
    singleError: SingleError;
}
export const Presets: React.FC<PresetsProps> = ({ presets, setPresets, customMonitors, setCustMonitors, normalizePositionsRef, setShowSimplePopUp, setSimplePopUpReason, singleError }) => {
    const [focusedPresetValue, setFocusedPresetValue] = useState<Preset | undefined>(undefined);
    const [presetSearchTerm, setPresetSearchTerm] = useState("");
    function setFocusedPreset(preset: Preset) {
        let newMons: FrontendMonitor[] = [];
        for (let i = 0; i < customMonitors.length; i++) {
            // has the same xid and has the mode xid needed available
            let presetAttempt = preset.monitors.find(
                (presetMon) =>
                (customMonitors[i].outputs[0].xid === presetMon.outputs[0].xid &&
                    customMonitors[i].outputs[0].modes.find((mode) => (mode.xid === presetMon.outputs[0].currentMode.xid))));
            if (presetAttempt) {
                console.log("monitor number ", i, " was overwritten");
            }
            newMons.push(presetAttempt ? { ...presetAttempt } : customMonitors[i])
        }
        setCustMonitors(newMons);
        setFocusedPresetValue(preset);
    }
    function overwriteFocusedPreset() {
        if (focusedPresetValue && normalizePositionsRef.current) {
            let normalizedMonitors = normalizePositionsRef.current(customMonitors);
            let newMonitors = normalizedMonitors.map((mon) => ({ ...mon, x: Number(mon.x.toFixed(0)), y: Number(mon.y.toFixed(0)) }))
            let newPreset = { name: focusedPresetValue.name, monitors: newMonitors };
            setShowSimplePopUp(true);
            setSimplePopUpReason("Overwriting Preset");
            invoke("create_preset", {
                preset: { name: focusedPresetValue.name, monitors: newMonitors }
            }).then((_res) => {
                setPresets((oldPresets) => (oldPresets.map((preset) => (preset.name == focusedPresetValue.name ? newPreset : preset))));
                setFocusedPresetValue(newPreset);
            }).catch((err) => {
                singleError.setShowSingleError(true);
                singleError.setSingleErrorText("Overwrite Preset failed due to " + err)
            });
            setShowSimplePopUp(false);
        }
    }
    function deletePreset(presetName: string) {
        setShowSimplePopUp(true);
        setSimplePopUpReason("Deleting Preset");
        console.log("deleting ", presetName);
        invoke("delete_preset", { presetName }).then((_res) => {
            if (focusedPresetValue && focusedPresetValue.name == presetName) {
                setFocusedPresetValue(undefined);
            }
            setPresets((oldPresets) => (oldPresets.filter((preset) => (preset.name != presetName))))
            console.log("preset deleted");
        }).catch((err) => {
            singleError.setShowSingleError(true);
            singleError.setSingleErrorText("Delete failed due to " + err)
        });
        setShowSimplePopUp(false);

    }
    function createPreset() {
        if (presetSearchTerm.trim() !== "") {
            let preset = { name: presetSearchTerm, monitors: [] };
            setShowSimplePopUp(true);
            setSimplePopUpReason("Creating Preset");
            invoke("create_preset", {
                preset
            }).then((_res) => {
                if (presets.findIndex((preset) => (preset.name == presetSearchTerm)) !== -1) {
                    setPresets((oldPresets) => (oldPresets.map((preset) => (preset.name == presetSearchTerm ? { name: preset.name, monitors: [] } : preset))));
                } else {
                    setPresets((oldPresets) => {
                        let newPresets = [...oldPresets];
                        newPresets.push(preset);
                        return (newPresets);
                    })
                }
                setPresetSearchTerm("");
            }).catch((err) => {
                singleError.setShowSingleError(true);
                singleError.setSingleErrorText("Create failed due to " + err)
            });
            setShowSimplePopUp(false);
        }
    }
    return (<div style={{ width: "20vw", height: "100%" }} >
        <div className="presets-top-container">
            <h2 className="mini-titles">Presets</h2>
            <div style={{ display: "flex", flexDirection: "row" }}>
                <input className="presets-search-bar" type="text" value={presetSearchTerm} onChange={(eve) => { setPresetSearchTerm(eve.target.value) }} />
                <button className="presets-add-button" onClick={createPreset}>+</button>
            </div>
        </div>
        <hr />
        <div className="presets-list-container">
            {presets.filter((preset) => (preset.name.includes(presetSearchTerm))).sort((a, b) => (a.name > b.name ? 1 : -1)).map((preset) => (
                <div key={preset.name} style={{ display: "flex", flexDirection: "row" }}>
                    <button className={focusedPresetValue && focusedPresetValue.name === preset.name ? "selected-preset-button" : "unselected-preset-button"} onClick={() => setFocusedPreset(preset)}>{preset.name}</button>
                    <button className="preset-delete-button" onClick={() => deletePreset(preset.name)}>X</button>
                </div>
            ))}
        </div>
        <hr />
        <button className="overwrite-button" onClick={overwriteFocusedPreset}>Overwrite Preset</button>
    </div>);
}
export default Presets;