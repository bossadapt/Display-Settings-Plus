import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import './MassApplyUndoPopup.css';
import { FrontendMonitor, MiniMonitor } from '../../globalValues';
import { invoke } from '@tauri-apps/api/core';
import { focusedSettingsFunctions } from '../LoadedScreen';
import { SingleError } from './SingleErrorPopUp';
import { cloneDeep } from 'lodash';

export interface MassApplyProps {
  showPopUp: boolean;
  initialMonitors: MutableRefObject<FrontendMonitor[]>;
  customMonitors: FrontendMonitor[];
  setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
  setShowMassUndoPopup: Dispatch<SetStateAction<boolean>>;
  toMiniMonitors: (monitors: FrontendMonitor[]) => MiniMonitor[];
  singleErrorProps: SingleError;
  resetFunctions: MutableRefObject<focusedSettingsFunctions>;
  setShowSimplePopup: Dispatch<SetStateAction<boolean>>;
}
export const MassApplyUndoPopup: React.FC<MassApplyProps> = ({
  showPopUp,
  initialMonitors,
  customMonitors,
  setMonitors,
  setShowMassUndoPopup,
  toMiniMonitors,
  singleErrorProps,
  resetFunctions,
  setShowSimplePopup,
}) => {
  function closeHandle() {
    initialMonitors.current = [...customMonitors];
    setShowMassUndoPopup(false);
    setShowSimplePopup(false);
  }
  async function undoHandle() {
    setShowSimplePopup(true);
    let miniMonitors = toMiniMonitors(initialMonitors.current);
    await invoke<(number | undefined)[]>('quick_apply', {
      monitors: miniMonitors,
    })
      .then(crtcs => {
        for (let i = 0; i < crtcs.length; i++) {
          if (crtcs[i]) {
            resetFunctions.current.setCrtc!(initialMonitors.current, i, crtcs[i]!);
          }
        }
      })
      .catch(err => {
        singleErrorProps.setShowSingleError(true);
        singleErrorProps.setSingleErrorText('Quick failed due to ' + err);
      });
    setMonitors(cloneDeep(initialMonitors.current));
    setShowMassUndoPopup(false);
    setShowSimplePopup(false);
  }
  return (
    <div className='mass-apply-popup' style={{ display: showPopUp ? 'block' : 'none' }}>
      <div className='mass-apply-contents'>
        <button
          className='mass-apply-close-button'
          onClick={() => {
            closeHandle();
          }}
        >
          Keep Changes
        </button>
        <hr />
        <button
          className='mass-apply-undo-button'
          onClick={() => {
            undoHandle();
          }}
        >
          Undo Changes
        </button>
      </div>
    </div>
  );
};
export default MassApplyUndoPopup;
