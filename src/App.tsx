import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FrontendMonitor, Preset } from "./globalValues";
import "./App.css";
import LoadedScreen from "./components/LoadedScreen";
import LoadingScreen from "./components/LoadingScreen";
import { SingleError } from "./components/SingleErrorPopUp";
function App() {
  const [customMonitorsInfo, setCustomMonitorsInfo] = useState<FrontendMonitor[]>([]);
  const didInit = useRef(false);
  const refreshMonitorsRef = useRef<Function>(refreshMonitors);
  const initialMonitorsInfo = useRef<FrontendMonitor[]>([]);
  const outputNames = useRef<String[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showSingleError, setShowSingleError] = useState(false);
  const [singleErrorText, setSingleErrorText] = useState("Failed due to blah blah blahblahblahblahblahblah blah blah blah blah blah blah blah blah");
  const singleErrorProps: SingleError = {
    showSingleError,
    setShowSingleError,
    singleErrorText,
    setSingleErrorText
  }
  //-1 for cases where there are no monitors

  //grabbing monitors info every 5 seconds

  useEffect(() => {
    if (didInit.current) {
      return;
    }
    didInit.current = true;
    init();

  }, []);
  //TODO: click inside freehand will set focus monitor
  //TODO: Clean UI
  //TODO: Write Read Me

  async function init() {
    await refreshMonitors();
    await getPresets();
  }
  // grabs monitors and updates screenshots
  async function refreshMonitors() {
    console.log("init called");
    initialMonitorsInfo.current = [];
    setCustomMonitorsInfo([]);
    invoke<[FrontendMonitor[], String[]]>("get_monitors", {}).then((res) => {
      //res = handleRotations(res);
      outputNames.current = res[1];
      console.log(res[1]);
      initialMonitorsInfo.current = [...res[0]];
      setCustomMonitorsInfo(res[0]);
      console.log(res[0]);
    }).catch((err) => {
      singleErrorProps.setShowSingleError(true);
      singleErrorProps.setSingleErrorText("Monitor refresh/resync failed due to " + err)
    });
  }
  async function getPresets() {
    console.log("getPresets called")
    invoke<Preset[]>("get_presets", {}).then((res) => {
      setPresets(res);
    }).catch((err) => {
      singleErrorProps.setShowSingleError(true);
      singleErrorProps.setSingleErrorText("Getting presets failed due to " + err)
    });
  }
  return (
    <div>{customMonitorsInfo.length != 0 ? <LoadedScreen singleErrorProps={singleErrorProps} outputNames={outputNames} presets={presets} setPresets={setPresets} monitorRefreshRef={refreshMonitorsRef} customMonitors={customMonitorsInfo} initialMonitors={initialMonitorsInfo} setCustMonitors={setCustomMonitorsInfo} /> : <LoadingScreen />}</div>
  );
}

export default App;
