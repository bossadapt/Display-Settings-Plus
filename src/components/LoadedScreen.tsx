import { Dispatch, MutableRefObject, SetStateAction, useRef, useState } from "react";
import Select from 'react-select';
import { customSelectTheme, FrontendMonitor, point } from "../globalValues";
import FreeHandPosition from "./FreeHandPosition";
import './Loaded.css';
import FocusedMonitorSettings from "./FocusedMonitorSettings";
import { Application, Renderer } from "pixi.js";
import { invoke } from "@tauri-apps/api/core";
import ApplySettingsPopup from "./ApplySettingsPopup";
interface LoadedProps {
  customMonitors: FrontendMonitor[];
  initialMonitors: MutableRefObject<FrontendMonitor[]>;
  setCustMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
}
export const LoadedScreen: React.FC<LoadedProps> = ({ customMonitors, initialMonitors, setCustMonitors }) => {
  const [focusedMonitorIdx, setFocusedMonitorIdx] = useState(0);
  const [focusedPreset, setFocusedPreset] = useState(0);
  const screenDragOffsetTotal = useRef<point>({ x: 0, y: 0 });
  const monitorScale = 10;
  const app = useRef<Application<Renderer> | null>(null);
  const normalizePositionsRef = useRef<Function | null>(null);
  const rerenderMonitorsContainerRef = useRef<Function | null>(null);
  const [focusedMonitorEnabled, setFocusedMonitorEnabled] = useState(customMonitors[focusedMonitorIdx].outputs[0].xid === 0);
  //TODO: make this more legit later
  const presetsOptions = [
    { value: 0, label: 'Preset 0' },
    { value: 1, label: 'Preset 1' },
    { value: 2, label: 'Preset 2' },
    { value: 3, label: 'Preset 3' }
  ]
  //Collection handler
  function applyAll() {
    //TODO: apply all and clean up the imports and exports
    //make it do something
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
  function applyPrimaryMonitor() {
    let newPrimaryIndex = customMonitors.findIndex((mon) => mon.isPrimary);
    let OldPrimaryIndex = initialMonitors.current.findIndex((mon) => mon.isPrimary);
    if (newPrimaryIndex != OldPrimaryIndex) {
      invoke("set_primary", { xid: customMonitors[newPrimaryIndex].outputs[0].xid }).then(() => {
        initialMonitors.current[OldPrimaryIndex].isPrimary = false;
        initialMonitors.current[newPrimaryIndex].isPrimary = true;

      }).catch((reason) => {
        //TODO:  handle error

        console.log("Primary not properly set:", reason);
      });
    }
  }
  //
  //
  return (
    //presets dropdown yoinked from https://react-select.com/home
    <div className="loadedMain">
      <div style={{ display: "flex", flexDirection: "row" }}>
        <Select options={presetsOptions} theme={customSelectTheme}></Select>
        <button style={{ color: "hotpink" }}>Save Preset</button>
        <button style={{ marginLeft: "auto", color: "hotpink" }} onClick={applyAll}>Apply All Changes</button>
      </div>
      <hr style={{ marginTop: "10px", marginBottom: "10px" }} />
      <div style={{ display: "flex", flexDirection: "row" }}>
        <h2 style={{ color: "white", marginLeft: "10px", marginTop: "2px", marginBottom: "10px", marginRight: "20px" }}>Primary Monitor:</h2>
        <Select onChange={(eve) => setPrimaryMonitor(eve?.value)} value={monitorOptions[customMonitors.findIndex((mon) => { return (mon.isPrimary == true) })]} options={monitorOptions} theme={customSelectTheme}></Select>
        <button onClick={resetPrimryMonitor}>Reset</button>
        <button onClick={applyPrimaryMonitor}>Apply</button>
      </div>
      <hr />
      <FreeHandPosition screenDragOffsetTotal={screenDragOffsetTotal} monitorScale={monitorScale} app={app} customMonitors={customMonitors} initialMonitors={initialMonitors.current} setMonitors={setCustMonitors} rerenderMonitorsContainerRef={rerenderMonitorsContainerRef} normalizePositionsRef={normalizePositionsRef}></FreeHandPosition>
      <hr />
      <div>
        <h2>Focused Monitor Settings</h2>
        <hr style={{ width: "36%" }} />
        {customMonitors.map((mon, idx) => { return (<button key={mon.name} disabled={focusedMonitorIdx == idx} onClick={() => { setFocusedMonitorIdx(idx) }}>{mon.name}</button>) })}
      </div>
      <hr />
      <div>
        <FocusedMonitorSettings screenDragOffsetTotal={screenDragOffsetTotal} monitorScale={monitorScale} freeHandPositionCanvas={app} focusedMonitorIdx={focusedMonitorIdx} customMonitors={customMonitors} initialMonitors={initialMonitors} setMonitors={setCustMonitors} rerenderMonitorsContainerRef={rerenderMonitorsContainerRef}></FocusedMonitorSettings>
      </div>
      <ApplySettingsPopup monitorsBeingApplied={[0]} customMonitors={customMonitors} initialMonitors={initialMonitors} normalizePositionsRef={normalizePositionsRef}></ApplySettingsPopup>
    </div >
  );
}
export default LoadedScreen;