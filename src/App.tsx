import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FrontendMonitor } from "./xrandr_exports";
import "./App.css";
import LoadedScreen from "./components/LoadedScreen";
import LoadingScreen from "./components/LoadingScreen";

function App() {
  const [customMonitorsInfo, setCustomMonitorsInfo] = useState<FrontendMonitor[]>([]);
  const didInit = useRef(false);
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
    getMonitors();
  }, []);

  async function getMonitors() {
    let monitors: FrontendMonitor[] = await invoke("get_monitors", {});
    initialMonitorsInfo.current = monitors;
    setCustomMonitorsInfo(monitors);
  }

  return (
    <div>{customMonitorsInfo.length != 0 ? <LoadedScreen customMonitors={customMonitorsInfo} initialMonitors={initialMonitorsInfo.current} setMonitors={setCustomMonitorsInfo} /> : <LoadingScreen />}</div>
  );
}

export default App;
