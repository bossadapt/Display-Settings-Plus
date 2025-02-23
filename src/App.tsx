import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FrontendMonitor } from "./globalValues";
import "./App.css";
import LoadedScreen from "./components/LoadedScreen";
import LoadingScreen from "./components/LoadingScreen";

function App() {
  const [customMonitorsInfo, setCustomMonitorsInfo] = useState<FrontendMonitor[]>([]);
  const didInit = useRef(false);
  const refreshMonitorsRef = useRef<Function>(refreshMonitors);
  const initialMonitorsInfo = useRef<FrontendMonitor[]>([]);
  const outputNames = useRef<String[]>([]);
  const presets = useRef<FrontendMonitor[][]>([]);

  //-1 for cases where there are no monitors

  //grabbing monitors info every 5 seconds

  useEffect(() => {
    if (didInit.current) {
      return;
    }
    didInit.current = true;
    getPresets();
    refreshMonitors();
  }, []);
  // let the loading screen do the work instead of busywait it
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
    });
  }
  async function getPresets() {
    console.log("getPresets called")
    invoke<FrontendMonitor[][]>("get_presets", {}).then((res) => {
      presets.current = res;
    }).catch((err) => {
      console.error(err);
    });
  }
  return (
    <div>{customMonitorsInfo.length != 0 ? <LoadedScreen outputNames={outputNames} presets={presets} monitorRefreshRef={refreshMonitorsRef} customMonitors={customMonitorsInfo} initialMonitors={initialMonitorsInfo} setCustMonitors={setCustomMonitorsInfo} /> : <LoadingScreen />}</div>
  );
}

export default App;
