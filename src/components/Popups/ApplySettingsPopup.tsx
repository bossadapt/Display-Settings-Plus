import { MutableRefObject, useEffect, useRef, useState } from 'react';
import { FrontendMonitor, PositionProps, Rotation } from '../../globalValues';
import { invoke } from '@tauri-apps/api/core';
import './ApplySettingsPopup.css';
import { focusedSettingsFunctions } from '../LoadedScreen';
import { cloneDeep } from 'lodash';
interface ApplySettingsPopupProps {
  initialMonitors: MutableRefObject<FrontendMonitor[]>;
  normalizePositionsRef: MutableRefObject<
    ((customMonitors: FrontendMonitor[]) => FrontendMonitor[]) | null
  >;
  applyChangesRef: MutableRefObject<Function | null>;
  resetFunctions: MutableRefObject<focusedSettingsFunctions>;
}
interface MonitorApplyState {
  overall: AttemptState;
  enabled: AttemptState;
  position: AttemptState;
  rotaiton: AttemptState;
  mode: AttemptState;
}
enum AttemptState {
  Waiting = 'waiting',
  InProgress = 'inProgress',
  Unchanged = 'unchanged',
  Completed = 'completed',
  Failed = 'failed',
  Undone = 'undone',
}
interface Attempt {
  state: AttemptState;
  reason: string;
}
interface FailInfos {
  monitorIdx: number;
  settingName: string;
  reason: string;
}
export const ApplySettingsPopup: React.FC<ApplySettingsPopupProps> = ({
  applyChangesRef,
  initialMonitors,
  normalizePositionsRef,
  resetFunctions,
}) => {
  let defaultMonitorApplyState: MonitorApplyState = {
    overall: AttemptState.Waiting,
    enabled: AttemptState.Waiting,
    position: AttemptState.Waiting,
    rotaiton: AttemptState.Waiting,
    mode: AttemptState.Waiting,
  };
  useEffect(() => {
    applyChangesRef.current = applyAllChanges;
  }, []);
  const failList = useRef<FailInfos[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [monitorStates, setMonitorStates] = useState<MonitorApplyState[]>(
    new Array(initialMonitors.current.length).fill({ ...defaultMonitorApplyState })
  );
  const custMonitorsRef = useRef<FrontendMonitor[]>([]);
  const [undoButtonText, setUndoButtonText] = useState('...');
  const [nextButtonText, setNextButtonText] = useState('...');
  const [buttonsEnabled, setButtonsEnabled] = useState(false);
  const [onErrorScreen, setOnErrorScreen] = useState(true);
  const [monitorsBeingChangedState, setMonitorsBeingChangedState] = useState<number[]>([]);
  const undoButtonPressed = useRef(false);
  const nextButtonPressed = useRef(false);

  async function applyAllChanges(
    customMonitors: FrontendMonitor[],
    monitorsBeingAppliedIndexs: number[]
  ) {
    setNextButtonText('...');
    setOnErrorScreen(false);
    failList.current = [];
    console.log('Pop up showing');
    setMonitorStates(
      new Array(initialMonitors.current.length).fill({ ...defaultMonitorApplyState })
    );

    custMonitorsRef.current = [...customMonitors];
    monitorsBeingAppliedIndexs.sort(
      (m1, m2) => custMonitorsRef.current[m1].x - custMonitorsRef.current[m2].x
    );
    setMonitorsBeingChangedState(monitorsBeingAppliedIndexs);
    setShowPopup(true);
    for (let i = 0; i < monitorsBeingAppliedIndexs.length; i++) {
      //set new monitor to in progress along with enable
      setMonitorStates(prevMon =>
        prevMon.map((mon, idx) =>
          idx === monitorsBeingAppliedIndexs[i]
            ? { ...mon, overall: AttemptState.InProgress, enabled: AttemptState.InProgress }
            : mon
        )
      );
      //enable
      // console.log("enabled called on monitor#", i);
      // console.log([...instancedMonitors.current])
      let enableAttempt = await applyEnable(monitorsBeingAppliedIndexs[i], custMonitorsRef);
      setMonitorStates(prevMon =>
        prevMon.map((mon, idx) =>
          idx === monitorsBeingAppliedIndexs[i] ? { ...mon, enabled: enableAttempt.state } : mon
        )
      );
      if (enableAttempt.state === AttemptState.Failed) {
        failList.current.push({
          monitorIdx: monitorsBeingAppliedIndexs[i],
          settingName: 'enabled',
          reason: enableAttempt.reason,
        });
      }
      //disabled or had to force an undo change(happens due to state not wanting to change due to the values === the initial without a change)
      if (
        !custMonitorsRef.current[monitorsBeingAppliedIndexs[i]].outputs[0].enabled ||
        enableAttempt.state !== AttemptState.Undone
      ) {
        // console.log("position called on monitor#", i);
        // console.log([...instancedMonitors.current])
        //position
        setMonitorStates(prevMon =>
          prevMon.map((mon, idx) =>
            idx === monitorsBeingAppliedIndexs[i]
              ? { ...mon, position: AttemptState.InProgress }
              : mon
          )
        );
        let positionAttempt = await applyPosition(
          monitorsBeingAppliedIndexs[i],
          custMonitorsRef,
          false
        );
        setMonitorStates(prevMon =>
          prevMon.map((mon, idx) =>
            idx === monitorsBeingAppliedIndexs[i]
              ? { ...mon, position: positionAttempt.state }
              : mon
          )
        );
        if (positionAttempt.state === AttemptState.Failed) {
          failList.current.push({
            monitorIdx: monitorsBeingAppliedIndexs[i],
            settingName: 'positions',
            reason: positionAttempt.reason,
          });
        }
        // console.log("rotation called on monitor#", i);
        // console.log([...instancedMonitors.current])
        // //rotation
        setMonitorStates(prevMon =>
          prevMon.map((mon, idx) =>
            idx === monitorsBeingAppliedIndexs[i]
              ? { ...mon, rotaiton: AttemptState.InProgress }
              : mon
          )
        );
        let rotationAttempt = await applyRotation(
          monitorsBeingAppliedIndexs[i],
          custMonitorsRef,
          false
        );
        setMonitorStates(prevMon =>
          prevMon.map((mon, idx) =>
            idx === monitorsBeingAppliedIndexs[i]
              ? { ...mon, rotaiton: rotationAttempt.state }
              : mon
          )
        );

        if (rotationAttempt.state === AttemptState.Failed) {
          failList.current.push({
            monitorIdx: monitorsBeingAppliedIndexs[i],
            settingName: 'rotation',
            reason: rotationAttempt.reason,
          });
        }
        // console.log("monitor called on monitor#", i);
        // console.log([...instancedMonitors.current])
        // //mode
        setMonitorStates(prevMon =>
          prevMon.map((mon, idx) =>
            idx === monitorsBeingAppliedIndexs[i] ? { ...mon, mode: AttemptState.InProgress } : mon
          )
        );
        let modeAttempt = await applyMode(monitorsBeingAppliedIndexs[i], custMonitorsRef, false);
        setMonitorStates(prevMon =>
          prevMon.map((mon, idx) =>
            idx === monitorsBeingAppliedIndexs[i] ? { ...mon, mode: modeAttempt.state } : mon
          )
        );
        if (modeAttempt.state === AttemptState.Failed) {
          failList.current.push({
            monitorIdx: monitorsBeingAppliedIndexs[i],
            settingName: 'mode',
            reason: modeAttempt.reason,
          });
        }
      } else {
        setMonitorStates(prevMon =>
          prevMon.map((mon, idx) =>
            idx === monitorsBeingAppliedIndexs[i]
              ? {
                  ...mon,
                  position: AttemptState.Completed,
                  rotation: AttemptState.Completed,
                  mode: AttemptState.Completed,
                }
              : mon
          )
        );
      }
      // console.log("monitor#", i, " finished");
      // console.log([...instancedMonitors.current])
      //overall
      if (
        failList.current.findIndex(fail => fail.monitorIdx === monitorsBeingAppliedIndexs[i]) !== -1
      ) {
        setMonitorStates(prevMon =>
          prevMon.map((mon, idx) =>
            idx === monitorsBeingAppliedIndexs[i] ? { ...mon, overall: AttemptState.Failed } : mon
          )
        );
      } else {
        setMonitorStates(prevMon =>
          prevMon.map((mon, idx) =>
            idx === monitorsBeingAppliedIndexs[i]
              ? { ...mon, overall: AttemptState.Completed }
              : mon
          )
        );
      }
    }
    setOnErrorScreen(true);
  }
  async function applyEnable(
    focusedMonitorIdx: number,
    custMonitorsRef: MutableRefObject<FrontendMonitor[]>
  ): Promise<Attempt> {
    let newMonitorEnabledSetting = custMonitorsRef.current[focusedMonitorIdx].outputs[0].enabled;
    let oldMonitorEnabledSetting = initialMonitors.current[focusedMonitorIdx].outputs[0].enabled;
    let output: Attempt = { state: AttemptState.Unchanged, reason: '' };
    console.log('apply enabled called on ', focusedMonitorIdx);
    if (newMonitorEnabledSetting !== oldMonitorEnabledSetting) {
      console.log('enable internal called');
      await invoke<number>('set_enabled', {
        xid: custMonitorsRef.current[focusedMonitorIdx].outputs[0].xid,
        enabled: newMonitorEnabledSetting,
      })
        .then(async newCrtc => {
          if (await promptUserToUndo()) {
            custMonitorsRef.current = [
              ...resetFunctions.current.enable!(focusedMonitorIdx, oldMonitorEnabledSetting),
            ];
            await invoke('set_enabled', {
              xid: initialMonitors.current[focusedMonitorIdx].outputs[0].xid,
              enabled: oldMonitorEnabledSetting,
            }).then(async _newCrtc => {
              await applyPosition(focusedMonitorIdx, custMonitorsRef, true);
              await applyRotation(focusedMonitorIdx, custMonitorsRef, true);
              await applyMode(focusedMonitorIdx, custMonitorsRef, true);
              output = { state: AttemptState.Undone, reason: '' };
            });
          } else {
            if (!newMonitorEnabledSetting) {
              initialMonitors.current[focusedMonitorIdx].outputs[0].enabled = false;
              initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.xid = 0;
              initialMonitors.current[focusedMonitorIdx].x = 0;
              initialMonitors.current[focusedMonitorIdx].y = 0;
              initialMonitors.current[focusedMonitorIdx].outputs[0].rotation = Rotation.Normal;
              initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.width =
                initialMonitors.current[focusedMonitorIdx].widthPx;
              initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.height =
                initialMonitors.current[focusedMonitorIdx].heightPx;
            } else {
              /*
                        crtc.mode = mode.xid;
                        crtc.width = mode.width;
                        crtc.height = mode.height;
                        */
              custMonitorsRef.current = [
                ...resetFunctions.current.setCrtc!(focusedMonitorIdx, newCrtc),
              ];
              let prefMode =
                initialMonitors.current[focusedMonitorIdx].outputs[0].preferredModes[0];
              initialMonitors.current[focusedMonitorIdx].outputs[0].enabled = true;
              initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode = prefMode;
              initialMonitors.current[focusedMonitorIdx].widthPx = prefMode.width;
              initialMonitors.current[focusedMonitorIdx].heightPx = prefMode.height;
            }
            output = { state: AttemptState.Completed, reason: '' };
          }
        })
        .catch(reason => {
          output = { state: AttemptState.Failed, reason: reason };
        });
    }
    return output;
  }
  async function applyRotation(
    focusedMonitorIdx: number,
    custMonitorsRef: MutableRefObject<FrontendMonitor[]>,
    forced: boolean
  ): Promise<Attempt> {
    let output: Attempt = { state: AttemptState.Unchanged, reason: '' };
    console.log('apply rotation called on ', focusedMonitorIdx);
    if (
      forced ||
      !(
        custMonitorsRef.current[focusedMonitorIdx].outputs[0].rotation ==
        initialMonitors.current[focusedMonitorIdx].outputs[0].rotation
      )
    ) {
      let newRotation = custMonitorsRef.current[focusedMonitorIdx].outputs[0].rotation;
      let oldRotation = initialMonitors.current[focusedMonitorIdx].outputs[0].rotation;
      let newWidth =
        newRotation === Rotation.Left || newRotation === Rotation.Right
          ? initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.height
          : initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.width;
      let newHeight =
        newRotation === Rotation.Left || newRotation === Rotation.Right
          ? initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.width
          : initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.height;

      console.log('rotation internal called');
      await invoke('set_rotation', {
        outputCrtc: custMonitorsRef.current[focusedMonitorIdx].outputs[0].crtc,
        rotation: newRotation,
        newWidth,
        newHeight,
      })
        .then(async () => {
          if (!forced && (await promptUserToUndo())) {
            custMonitorsRef.current = [...resetFunctions.current.rotation!(focusedMonitorIdx)];
            newWidth =
              oldRotation === Rotation.Left || oldRotation === Rotation.Right
                ? initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.height
                : initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.width;
            newHeight =
              oldRotation === Rotation.Left || oldRotation === Rotation.Right
                ? initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.width
                : initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode.height;
            await invoke('set_rotation', {
              outputCrtc: initialMonitors.current[focusedMonitorIdx].outputs[0].crtc,
              rotation: oldRotation,
              newWidth,
              newHeight,
            });

            output = { state: AttemptState.Undone, reason: '' };
          } else {
            initialMonitors.current[focusedMonitorIdx].outputs[0].rotation =
              custMonitorsRef.current[focusedMonitorIdx].outputs[0].rotation;
            output = { state: AttemptState.Completed, reason: '' };
          }
        })
        .catch(reason => {
          output = { state: AttemptState.Failed, reason: reason };
        });
    }
    return output;
  }
  function monitor2PositionProps(monitors: FrontendMonitor[]): PositionProps[] {
    console.log('entered 2positionprops :', monitors);
    if (normalizePositionsRef.current) {
      monitors = normalizePositionsRef.current!(monitors);
    }
    return monitors.map(monitor => ({
      output_crtc: monitor.outputs[0].crtc,
      x: monitor.x.toFixed(0),
      y: monitor.y.toFixed(0),
    }));
  }
  async function applyPosition(
    focusedMonitorIdx: number,
    custMonitorsRef: MutableRefObject<FrontendMonitor[]>,
    forced: boolean
  ): Promise<Attempt> {
    let output: Attempt = { state: AttemptState.Unchanged, reason: '' };
    console.log('position function called');
    let initialMonitorsClone = cloneDeep(initialMonitors.current);
    if (
      forced ||
      !(
        custMonitorsRef.current[focusedMonitorIdx].x ===
          initialMonitors.current[focusedMonitorIdx].x &&
        custMonitorsRef.current[focusedMonitorIdx].y ===
          initialMonitors.current[focusedMonitorIdx].y
      )
    ) {
      let newPropsList: PositionProps[] = monitor2PositionProps(
        initialMonitorsClone.map((mon, posIdx) =>
          posIdx === focusedMonitorIdx ? custMonitorsRef.current[focusedMonitorIdx] : mon
        )
      );
      await invoke('set_positions', {
        props: newPropsList,
      })
        .then(async () => {
          if (!forced && (await promptUserToUndo())) {
            initialMonitorsClone = cloneDeep(initialMonitors.current);
            let oldPropsList: PositionProps[] = monitor2PositionProps(initialMonitorsClone);
            console.log('internals of redo func called');
            custMonitorsRef.current = [...resetFunctions.current.position!(focusedMonitorIdx)];
            console.log(
              'output:',
              custMonitorsRef.current[focusedMonitorIdx].outputs[0].crtc,
              ',x:',
              custMonitorsRef.current[focusedMonitorIdx].x,
              ',y:',
              custMonitorsRef.current[focusedMonitorIdx].y
            );
            await invoke('set_positions', {
              props: oldPropsList,
            });
            output = { state: AttemptState.Undone, reason: '' };
            custMonitorsRef.current[focusedMonitorIdx].x =
              initialMonitors.current[focusedMonitorIdx].x;
            custMonitorsRef.current[focusedMonitorIdx].y =
              initialMonitors.current[focusedMonitorIdx].y;
          } else {
            initialMonitors.current[focusedMonitorIdx].x =
              custMonitorsRef.current[focusedMonitorIdx].x;
            initialMonitors.current[focusedMonitorIdx].y =
              custMonitorsRef.current[focusedMonitorIdx].y;
            output = { state: AttemptState.Completed, reason: '' };
          }
        })
        .catch(reason => {
          output = { state: AttemptState.Failed, reason: reason };
        });
      console.log(
        'initial4 x:' +
          initialMonitors.current[focusedMonitorIdx].x +
          ', initial y:' +
          initialMonitors.current[focusedMonitorIdx].y
      );
      console.log(
        'cust4 x:' +
          custMonitorsRef.current[focusedMonitorIdx].x +
          ', cust y:' +
          custMonitorsRef.current[focusedMonitorIdx].y
      );
    }
    return output;
  }
  async function applyMode(
    focusedMonitorIdx: number,
    custMonitorsRef: MutableRefObject<FrontendMonitor[]>,
    forced: boolean
  ): Promise<Attempt> {
    let output: Attempt = { state: AttemptState.Unchanged, reason: '' };
    let oldMode = initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode!;
    let newMode = custMonitorsRef.current[focusedMonitorIdx].outputs[0].currentMode!;
    let newRotation = custMonitorsRef.current[focusedMonitorIdx].outputs[0].rotation;
    console.log('apply mode called on ', focusedMonitorIdx);
    if (forced || newMode.xid !== oldMode.xid) {
      console.log('mode internal called');
      await invoke('set_mode', {
        outputCrtc: custMonitorsRef.current[focusedMonitorIdx].outputs[0].crtc,
        modeXid: newMode.xid,
        modeHeight:
          newRotation == Rotation.Left || newRotation == Rotation.Right
            ? newMode.width
            : newMode.height,
        modeWidth:
          newRotation == Rotation.Left || newRotation == Rotation.Right
            ? newMode.height
            : newMode.width,
      })
        .then(async () => {
          if (!forced && (await promptUserToUndo())) {
            await invoke('set_mode', {
              outputCrtc: custMonitorsRef.current[focusedMonitorIdx].outputs[0].crtc,
              modeXid: oldMode.xid,
              modeHeight:
                newRotation == Rotation.Left || newRotation == Rotation.Right
                  ? oldMode.width
                  : oldMode.height,
              modeWidth:
                newRotation == Rotation.Left || newRotation == Rotation.Right
                  ? oldMode.height
                  : oldMode.width,
            });
            custMonitorsRef.current = [...resetFunctions.current.mode!(focusedMonitorIdx)];
            output = { state: AttemptState.Undone, reason: '' };
          } else {
            initialMonitors.current[focusedMonitorIdx].outputs[0].currentMode! =
              custMonitorsRef.current[focusedMonitorIdx].outputs[0].currentMode!;
            output = { state: AttemptState.Completed, reason: '' };
          }
        })
        .catch(reason => {
          output = { state: AttemptState.Failed, reason: reason };
        });
    }
    return output;
  }

  //https://stackoverflow.com/questions/37764665/how-to-implement-sleep-function-in-typescript
  const secondsToUndo = 15;
  async function promptUserToUndo(): Promise<boolean> {
    setButtonsEnabled(true);
    undoButtonPressed.current = false;
    nextButtonPressed.current = false;
    setNextButtonText('Continue');
    for (let i = secondsToUndo; i > -1; i--) {
      if (undoButtonPressed.current) {
        setUndoButtonText('...');
        setNextButtonText('...');
        return true;
      } else if (nextButtonPressed.current) {
        setUndoButtonText('...');
        setNextButtonText('...');
        return false;
      } else {
        setUndoButtonText('Undo(' + i + ')');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    setNextButtonText('...');
    setUndoButtonText('...');
    return false;
  }
  return onErrorScreen ? (
    <div className='popup' style={{ display: showPopup ? 'block' : 'none' }}>
      <div className='popupContentsContainer'>
        <h1 className='popupTitle'>Applying Errors</h1>
        <div className='errorTableContainer'>
          <table className='errorTable'>
            <tbody>
              {failList.current.map(err => (
                <tr key={err.monitorIdx + err.settingName}>
                  <td>
                    Failed to apply {err.settingName} on monitor{' '}
                    {initialMonitors.current[err.monitorIdx].name} because {err.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className='finishButton'
          onClick={() => {
            setShowPopup(false);
          }}
        >
          Finish
        </button>
      </div>
    </div>
  ) : (
    <div className='popup' style={{ display: showPopup ? 'block' : 'none' }}>
      <div className='popupContentsContainer'>
        <h1 className='popupTitle'>Applying Settings</h1>
        <div className='monitorStatesContainer'>
          {monitorsBeingChangedState.map(monIdx => (
            <div key={initialMonitors.current[monIdx].name} className='monitorState'>
              <h2 id={monitorStates[monIdx].overall}>{initialMonitors.current[monIdx].name}</h2>
              <hr />
              <h4 id={monitorStates[monIdx].enabled}>Enabled:{monitorStates[monIdx].enabled}</h4>
              <h4 id={monitorStates[monIdx].position}>Position:{monitorStates[monIdx].position}</h4>
              <h4 id={monitorStates[monIdx].rotaiton}>Rotation:{monitorStates[monIdx].rotaiton}</h4>
              <h4 id={monitorStates[monIdx].mode}>Mode:{monitorStates[monIdx].mode}</h4>
            </div>
          ))}
        </div>
        <div className='popupButtonContainer'>
          <button
            style={{ borderRadius: '0px 0px 0px 10px' }}
            className='popupButton'
            disabled={!buttonsEnabled}
            onClick={() => {
              undoButtonPressed.current = true;
            }}
          >
            {undoButtonText}
          </button>
          <button
            style={{ borderRadius: '0px 0px 10px 0px' }}
            className='popupButton'
            disabled={!buttonsEnabled}
            onClick={() => {
              nextButtonPressed.current = true;
            }}
          >
            {nextButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};
export default ApplySettingsPopup;
