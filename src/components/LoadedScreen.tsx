import { Dispatch, SetStateAction, useState } from "react";
import Select from 'react-select';
import { FrontendMonitor } from "../xrandr_exports";
import FreeHandPosition from "./FreeHandPosition";
import './Loaded.css';
interface LoadedProps {
  customMonitors: FrontendMonitor[];
  initialMonitors: FrontendMonitor[];
  setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
}
export const LoadedScreen: React.FC<LoadedProps> = ({ customMonitors, initialMonitors }) => {
  const [focusedMonitor, setFocusedMonitor] = useState<FrontendMonitor | null>(null);
  const [focusedPreset, setFocusedPreset] = useState(0);
  //TODO: make this more legit later
  const presetsOptions = [
    { value: 0, label: 'Preset 0' },
    { value: 1, label: 'Preset 1' },
    { value: 2, label: 'Preset 2' },
    { value: 3, label: 'Preset 3' }
  ]
  const monitorOptions = customMonitors.map((mon) => { return { value: mon.name, label: mon.name } })
  return (
    //presets dropdown yoinked from https://react-select.com/home
    <div className="loadedMain">
      <div style={{ display: "flex", flexDirection: "row" }}>
        {/*TODO: make a universal color scheme for select so that its not unreadable*/}
        <Select options={presetsOptions} theme={(theme) => ({
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
        <button style={{ color: "hotpink", height: "40px" }}>Save Preset</button>
        {/*TODO: add an onclick*/}
        <button style={{ marginLeft: "auto", color: "hotpink", height: "40px" }}>Apply Changes</button>
      </div>
      <hr style={{ marginTop: "10px", marginBottom: "10px" }} />
      <div style={{ display: "flex", flexDirection: "row" }}>
        <h2 style={{ color: "white", marginLeft: "10px", marginTop: "2px", marginBottom: "10px", marginRight: "20px" }}>Primary Monitor:</h2>
        <Select defaultValue={monitorOptions[customMonitors.findIndex((mon) => { return (mon.isPrimary == true) })]} options={monitorOptions} theme={(theme) => ({
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
      </div>
      <hr />
      <FreeHandPosition customMonitors={customMonitors} initialMonitors={initialMonitors}></FreeHandPosition>
      <hr />
      <div>
        <h2>Focused Monitor Settings</h2>
        <hr style={{ width: "36%" }} />
        {customMonitors.map((mon) => { return (<button disabled={focusedMonitor === mon} onClick={() => { setFocusedMonitor(mon) }}>{mon.name}</button>) })}
      </div>
      <hr />
      <div>
        {/*TODO: individual monitor settings*/}
      </div>
    </div>
  );
}
export default LoadedScreen;