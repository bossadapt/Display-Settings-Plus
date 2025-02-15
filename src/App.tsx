import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FrontendMonitor, Rotation } from "./globalValues";
import "./App.css";
import LoadedScreen from "./components/LoadedScreen";
import LoadingScreen from "./components/LoadingScreen";

function App() {
  const [customMonitorsInfo, setCustomMonitorsInfo] = useState<FrontendMonitor[]>([]);
  const didInit = useRef(false);
  const refreshMonitorsRef = useRef<Function>(refreshMonitors);
  const initialMonitorsInfo = useRef<FrontendMonitor[]>([]);

  //-1 for cases where there are no monitors

  //grabbing monitors info every 5 seconds

  useEffect(() => {
    // This code will run only once, after the initial render
    // const interval = setInterval(() => {
    //   getMonitors();
    // }, 5000);
    // return () => clearInterval(interval);
    if (didInit.current) {
      return;
    }
    didInit.current = true;
    refreshMonitors();
  }, []);
  // let the loading screen do the work instead of busywait it
  async function refreshMonitors() {
    console.log("init called");
    initialMonitorsInfo.current = [];
    setCustomMonitorsInfo([]);
    invoke<FrontendMonitor[]>("get_monitors", {}).then((res) => {
      res = handleRotations(res);
      initialMonitorsInfo.current = res;
      setCustomMonitorsInfo(res);
      console.log(res);
    });
  }
  function handleRotations(input: FrontendMonitor[]): FrontendMonitor[] {
    //initial monitors true rotation is stored in the monitor instead of the mode but I'm undoing that to handle state slightly more cleanly
    return input.map((curMon) =>
    (curMon.outputs[0].rotation === Rotation.Left || curMon.outputs[0].rotation === Rotation.Right
      ? { ...curMon, widthMm: curMon.heightMm, heightMm: curMon.widthMm, widthPx: curMon.heightPx, heightPx: curMon.widthPx, outputs: curMon.outputs.map((out, idx) => (idx === 0 ? { ...out, currentMode: { ...out.currentMode!, width: curMon.outputs[0].currentMode!.height, height: curMon.outputs[0].currentMode!.width } } : out)) }
      : curMon)
    );
  }
  return (
    <div>{customMonitorsInfo.length != 0 ? <LoadedScreen monitorRefreshRef={refreshMonitorsRef} customMonitors={customMonitorsInfo} initialMonitors={initialMonitorsInfo} setCustMonitors={setCustomMonitorsInfo} /> : <LoadingScreen />}</div>
  );
}

export default App;
