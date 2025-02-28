import { Dispatch, MutableRefObject, SetStateAction, useRef, useState } from "react";
import Select from 'react-select';
import { customSelectTheme, FrontendMonitor, MiniMonitor, Preset, Rotation } from "../globalValues";
import FreeHandPosition from "./FreeHandPosition";
import './Loaded.css';
import FocusedMonitorSettings from "./FocusedMonitorSettings";
import { invoke } from "@tauri-apps/api/core";
import ApplySettingsPopup from "./ApplySettingsPopup";
import SimplePopUp from "./SimplePopUp";
import Presets from "./Presets";
import SingleErrorPopup, { SingleError } from "./SingleErrorPopUp";
interface LoadedProps {
  singleErrorProps: SingleError;
  monitorRefreshRef: MutableRefObject<Function>;
  customMonitors: FrontendMonitor[];
  initialMonitors: MutableRefObject<FrontendMonitor[]>;
  presets: Preset[];
  setPresets: Dispatch<SetStateAction<Preset[]>>;
  setCustMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
  outputNames: MutableRefObject<String[]>;
}
export interface focusedSettingsFunctions {
  enable: ((monitors: FrontendMonitor[], focusedMonitorIdx: number, enabled: boolean) => FrontendMonitor[]) | null;
  position: ((monitors: FrontendMonitor[], focusedMonitorIdx: number) => FrontendMonitor[]) | null;
  rotation: ((monitors: FrontendMonitor[], focusedMonitorIdx: number) => FrontendMonitor[]) | null;
  mode: ((monitors: FrontendMonitor[], focusedMonitorIdx: number) => FrontendMonitor[]) | null;
  setCrtc: ((monitors: FrontendMonitor[], focusedMonitorIdx: number, newCrtc: number) => FrontendMonitor[]) | null;
}
export const LoadedScreen: React.FC<LoadedProps> = ({ singleErrorProps, monitorRefreshRef, customMonitors, initialMonitors, presets, setPresets, setCustMonitors, outputNames }) => {
  const [focusedMonitorIdx, setFocusedMonitorIdx] = useState(0);
  const resetFunctions = useRef<focusedSettingsFunctions>({ enable: null, position: null, rotation: null, mode: null, setCrtc: null });
  const applyChangesRef = useRef<((customMonitors: FrontendMonitor[], monitorsBeingApplied: number[]) => void) | null>(null);
  const normalizePositionsRef = useRef<((customMonitors: FrontendMonitor[]) => FrontendMonitor[]) | null>(null);
  const rerenderMonitorsContainerRef = useRef<((customMonitors: FrontendMonitor[]) => void) | null>(null);
  const [showSimplePopUp, setShowSimplePopUp] = useState(false);
  const [simplePopUpReason, setSimplePopUpReason] = useState("blah blah..");
  const [monitorScale, setMonitorScale] = useState(10);
  //Collection handler
  async function applyAll() {
    console.log("apply all called")
    await applyPrimaryMonitor();
    if (applyChangesRef.current) {
      console.log("applying all exists");
      await applyChangesRef.current(customMonitors, customMonitors.map((_mon, idx) => (idx)));
    }
    console.log("after initial:");
    console.log(initialMonitors.current);
  }

  //PRIMARY MONITOR
  const monitorOptions = customMonitors.map((mon) => { return { value: mon.name, label: mon.name } })
  function setPrimaryMonitor(newPrimName: String | undefined) {
    if (newPrimName) {
      setCustMonitors((mons) => (mons.map((mon) => (mon.name == newPrimName ? { ...mon, isPrimary: true } : { ...mon, isPrimary: false }))));
    }
  }
  function resetPrimryMonitor() {
    setCustMonitors((mons) => (mons.map((mon, idx) => ({ ...mon, isPrimary: initialMonitors.current[idx].isPrimary }))));
  }
  async function applyPrimaryMonitor() {
    let newPrimaryIndex = customMonitors.findIndex((mon) => mon.isPrimary);
    let OldPrimaryIndex = initialMonitors.current.findIndex((mon) => mon.isPrimary);
    if (newPrimaryIndex != OldPrimaryIndex) {
      console.log("primary internal called");
      await invoke("set_primary", { xid: customMonitors[newPrimaryIndex].outputs[0].xid }).then(() => {
        initialMonitors.current[OldPrimaryIndex].isPrimary = false;
        initialMonitors.current[newPrimaryIndex].isPrimary = true;

      }).catch((reason) => {
        singleErrorProps.setShowSingleError(true);
        singleErrorProps.setSingleErrorText("Failed to set primary monitor due to " + reason)
      });
    }
  }


  function resetAll() {
    setCustMonitors([...initialMonitors.current]);
    if (rerenderMonitorsContainerRef.current)
      rerenderMonitorsContainerRef.current(initialMonitors.current);
  }
  async function massApply() {
    setShowSimplePopUp(true);
    setSimplePopUpReason("Mass Applying");
    await applyPrimaryMonitor();
    if (normalizePositionsRef.current) {
      let miniMonitors: MiniMonitor[] = normalizePositionsRef.current!(customMonitors).map((mon) => (
        {
          output_xid: mon.outputs[0].xid,
          enabled: mon.outputs[0].enabled,
          rotation: mon.outputs[0].rotation,
          mode_xid: mon.outputs[0].currentMode.xid,
          mode_height: mon.outputs[0].rotation === Rotation.Normal || mon.outputs[0].rotation === Rotation.Inverted ? mon.outputs[0].currentMode.height : mon.outputs[0].currentMode.width,
          mode_width: mon.outputs[0].rotation === Rotation.Normal || mon.outputs[0].rotation === Rotation.Inverted ? mon.outputs[0].currentMode.width : mon.outputs[0].currentMode.height,
          x: mon.x.toFixed(0),
          y: mon.y.toFixed(0),
        }
      )
      );

      //normalize all positions and pass
      await invoke<(number | undefined)[]>("quick_apply", {
        monitors: miniMonitors
      }).then((crtcs) => {
        for (let i = 0; i < crtcs.length; i++) {
          if (crtcs[i]) {
            resetFunctions.current.setCrtc!(customMonitors, i, crtcs[i]!);
          }
        }
        initialMonitors.current = [...customMonitors];
      }).catch((err) => {
        singleErrorProps.setShowSingleError(true);
        singleErrorProps.setSingleErrorText("Quick failed due to " + err)
      });
    }
    setShowSimplePopUp(false);

  }
  const customStyles = {
    control: (base: any) => ({
      ...base,
      height: 52,
      minHeight: 52
    })
  };
  function copyScript() {
    setShowSimplePopUp(true);
    setSimplePopUpReason("Creating Script");
    let script: String = "xrandr"
    for (let i = 0; i < outputNames.current.length; i++) {
      let focusedMonitor = customMonitors.find((mon) => (mon.outputs[0].name === outputNames.current[i]));
      console.log("focused monitor:");
      console.log(outputNames.current[i]);
      console.log(focusedMonitor);
      if (focusedMonitor && focusedMonitor.outputs[0].enabled) {
        script += " --output " + outputNames.current[i] +
          " --mode " + focusedMonitor.outputs[0].currentMode.name +
          " --rate " + focusedMonitor.outputs[0].currentMode.rate +
          " --pos " + focusedMonitor.x + "x" + focusedMonitor.y +
          " --rotate " + focusedMonitor.outputs[0].rotation.toLocaleLowerCase();
      } else {
        script += " --output " + outputNames.current[i] + " --off";
      }
      navigator.clipboard.writeText(script.toString());
      setShowSimplePopUp(false);
    }
  }
  return (
    <div className="loadedMain">
      <div style={{ display: "flex", flexDirection: "row" }}>
        <button className="majorButtons" onClick={resetAll}>Reset</button>
        <button className="majorButtons" onClick={() => { monitorRefreshRef.current() }}>Resync</button>
        <button className="majorButtons" style={{ marginLeft: "auto" }} onClick={copyScript}>Clipboard</button>
        <button className="majorButtons" onClick={massApply}>Mass Apply</button>
        <button className="majorButtons" onClick={applyAll}>Safe Apply</button>
      </div>
      <hr style={{ marginBottom: "5px" }} />
      <div style={{ display: "flex", flexDirection: "row" }}>
        <h2 style={{ color: "white", marginLeft: "10px", marginTop: "auto", marginBottom: "auto", marginRight: "20px" }}>Primary Monitor:</h2>
        <Select styles={customStyles} onChange={(eve) => setPrimaryMonitor(eve?.value)} value={monitorOptions[customMonitors.findIndex((mon) => { return (mon.isPrimary == true) })]} options={monitorOptions} theme={customSelectTheme}></Select>
        <button onClick={resetPrimryMonitor}>Reset</button>
        <button onClick={applyPrimaryMonitor}>Apply</button>
      </div>
      <hr style={{ marginTop: "5px" }} />
      <div style={{ display: 'flex', flexDirection: "row" }}>
        <Presets presets={presets} setPresets={setPresets} customMonitors={customMonitors} setCustMonitors={setCustMonitors} setSimplePopUpReason={setSimplePopUpReason} setShowSimplePopUp={setShowSimplePopUp} normalizePositionsRef={normalizePositionsRef} singleError={singleErrorProps}></Presets>
        <FreeHandPosition monitorScale={monitorScale} setMonitorScale={setMonitorScale} customMonitors={customMonitors} initialMonitors={initialMonitors} setMonitors={setCustMonitors} rerenderMonitorsContainerRef={rerenderMonitorsContainerRef} normalizePositionsRef={normalizePositionsRef}></FreeHandPosition>
      </div>
      <hr />
      <div>
        <h2>Focused Monitor Settings</h2>
        <hr style={{ width: "36%" }} />
        {customMonitors.map((mon, idx) => { return (<button key={mon.name} disabled={focusedMonitorIdx == idx} onClick={() => { setFocusedMonitorIdx(idx) }}>{mon.name}</button>) })}
      </div>
      <hr />
      <div>
        <FocusedMonitorSettings monitorScale={monitorScale} resetFunctions={resetFunctions} focusedMonitorIdx={focusedMonitorIdx} customMonitors={customMonitors} initialMonitors={initialMonitors} setMonitors={setCustMonitors} rerenderMonitorsContainerRef={rerenderMonitorsContainerRef}></FocusedMonitorSettings>
      </div>
      <ApplySettingsPopup resetFunctions={resetFunctions} applyChangesRef={applyChangesRef} initialMonitors={initialMonitors} normalizePositionsRef={normalizePositionsRef}></ApplySettingsPopup>
      <SimplePopUp showSimplePopUp={showSimplePopUp} reasonForPopUp={simplePopUpReason}></SimplePopUp>
      <SingleErrorPopup setSingleErrorText={singleErrorProps.setSingleErrorText} showSingleError={singleErrorProps.showSingleError} singleErrorText={singleErrorProps.singleErrorText} setShowSingleError={singleErrorProps.setShowSingleError}></SingleErrorPopup>
    </div >
  );
}
export default LoadedScreen;