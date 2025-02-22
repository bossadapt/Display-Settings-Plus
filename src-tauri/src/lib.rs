use std::{
    fs::File,
    io::{self, BufWriter, ErrorKind},
};

use serde::{Deserialize, Serialize};
use xrandr::{Crtc, Mode, Rotation, ScreenResources, XHandle, XId, XrandrError};
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
//added this to serialize without editing the library
#[derive(Serialize, Deserialize, Debug)]
struct FrontendMonitor {
    name: String,
    #[serde(rename = "isPrimary")]
    is_primary: bool,
    x: i32,
    y: i32,
    #[serde(rename = "widthPx")]
    width_px: i32,
    #[serde(rename = "heightPx")]
    height_px: i32,
    /// An Output describes an actual physical monitor or display. A [`Monitor`]
    /// can have more than one output.
    outputs: Vec<FrontendOutput>,
}
#[derive(Serialize, Deserialize, Debug)]
struct FrontendOutput {
    xid: XId,
    #[serde(rename = "isPrimary")]
    is_primary: bool,
    enabled: bool,
    crtc: Option<XId>,
    //derived from crtc
    rotation: Rotation,
    name: String,
    connected: bool,
    modes: Vec<Mode>,
    #[serde(rename = "preferredModes")]
    preferred_modes: Vec<Mode>,
    #[serde(rename = "currentMode")]
    current_mode: Mode,
}
//dropping properties because its too extra for someone editing settings via gui to care
#[tauri::command]
async fn get_monitors() -> Result<Vec<FrontendMonitor>, XrandrError> {
    let mut xhandle = XHandle::open()?;
    let res = ScreenResources::new(&mut xhandle)?;
    let crtcs = res.crtcs(&mut xhandle)?;
    let modes = res.modes();
    let outputs = res.outputs(&mut xhandle, Some(&crtcs), &res)?;
    //TODO: crtcs and modes(for peffered and modes) should be called and picked apart
    let enabled_monitors: Vec<FrontendMonitor> = outputs
        .iter()
        .filter(|&out| out.connected && out.current_mode.is_some())
        .map(|out| {
            let focused_crtc: Crtc = crtcs
                .iter()
                .find(|crtc| crtc.xid == out.crtc.unwrap())
                .unwrap()
                .clone();
            return FrontendMonitor {
                name: out.name.clone(),
                is_primary: out.is_primary,
                x: focused_crtc.x,
                y: focused_crtc.y,
                width_px: focused_crtc.width as i32,
                height_px: focused_crtc.height as i32,
                outputs: vec![FrontendOutput {
                    xid: out.xid,
                    is_primary: out.is_primary,
                    crtc: out.crtc,
                    enabled: out.current_mode.is_some(),
                    rotation: focused_crtc.rotation.into(),
                    name: out.name.clone(),
                    connected: out.connected,
                    modes: mode_from_list(modes.clone(), &out.modes),
                    preferred_modes: mode_from_list(modes.clone(), &out.preferred_modes),
                    current_mode: modes
                        .iter()
                        .find(|mode| mode.xid == out.current_mode.unwrap())
                        .unwrap()
                        .clone(),
                }],
            };
        })
        .collect();
    fn mode_from_list(modes: Vec<Mode>, mode_list: &Vec<u64>) -> Vec<Mode> {
        return modes
            .into_iter()
            .filter(|mode| mode_list.contains(&mode.xid))
            .collect();
    }
    // xhandle.set_rotation(output, rotation)
    // let test = ScreenResources::mode(xhandle);
    // println!("{:#?}", test.join("\n NEW \n"));
    //println!("{:#?}", monitors[0].outputs[0].properties);
    //
    let disabled_monitors: Vec<FrontendMonitor> = outputs
        .iter()
        .filter(|&out| out.connected && out.current_mode.is_none())
        .map(|out| {
            let preferred_mode = modes
                .iter()
                .find(|mode| mode.xid == out.preferred_modes[0])
                .unwrap();
            FrontendMonitor {
                name: out.name.clone(),
                is_primary: false,
                x: 0,
                y: 0,
                width_px: preferred_mode.width as i32,
                height_px: preferred_mode.height as i32,
                outputs: vec![FrontendOutput {
                    xid: out.xid,
                    is_primary: out.is_primary,
                    enabled: false,
                    crtc: out.crtc,
                    rotation: Rotation::Normal,
                    name: out.name.clone(),
                    connected: out.connected,
                    modes: mode_from_list(modes.clone(), &out.modes),
                    preferred_modes: mode_from_list(modes.clone(), &out.preferred_modes),
                    current_mode: preferred_mode.clone(),
                }],
            }
        })
        .collect::<Vec<FrontendMonitor>>();
    let mut output: Vec<FrontendMonitor> = Vec::new();
    for monitor in enabled_monitors {
        output.push(monitor);
    }
    for monitor in disabled_monitors {
        output.push(monitor);
    }
    Ok(output)
}

#[tauri::command]
async fn set_primary(xid: u64) -> Result<(), XrandrError> {
    let mut xhandle = XHandle::open()?;
    xhandle.set_primary(xid);
    return Ok(());
}
//ueses strings to parce because javascript round ,ciel and trunc make numbers like 1920.0 or 0.999999999999999999432 and im bored of it
#[tauri::command]
async fn set_position(output_crtc: u64, x: String, y: String) -> Result<(), XrandrError> {
    //setting up vars
    let mut xhandle = XHandle::open()?;
    //shadow the dumb strings
    let x: i32 = x.parse().unwrap();
    let y: i32 = y.parse().unwrap();
    //making the change
    println!("position set x:{}, y:{}", x, y);
    xhandle.set_position(output_crtc, x, y)?;
    return Ok(());
}
#[tauri::command]
async fn set_rotation(output_crtc: u64, rotation: Rotation) -> Result<(), XrandrError> {
    //setting up vars
    let mut xhandle = XHandle::open()?;
    //making the change
    xhandle.set_rotation(output_crtc, &rotation)?;
    return Ok(());
}
///returns crtc after enabling monitor
#[tauri::command]
async fn set_enabled(xid: u64, enabled: bool) -> Result<u64, XrandrError> {
    //setting up vars
    let mut xhandle = XHandle::open()?;
    let res = ScreenResources::new(&mut xhandle)?;
    let focused_output = res.output(&mut xhandle, xid, None, &res)?;
    //making the change
    let mut new_crtc = 0;
    if enabled {
        new_crtc = xhandle.enable(&focused_output, &res)?;
    } else {
        xhandle.disable(&focused_output, &res)?;
    }
    return Ok(new_crtc);
}
#[tauri::command]
async fn set_mode(
    output_crtc: u64,
    mode_xid: u64,
    mode_height: u32,
    mode_width: u32,
) -> Result<(), XrandrError> {
    //setting up vars
    let mut xhandle = XHandle::open()?;
    let res = ScreenResources::new(&mut xhandle)?;
    //making the change
    xhandle.set_mode(output_crtc, mode_xid, mode_height, mode_width, &res)?;
    return Ok(());
}
#[tauri::command]
async fn get_presets() -> Result<Vec<Vec<FrontendMonitor>>, String> {
    let mut presets: Vec<Vec<FrontendMonitor>> = Vec::new();
    for i in 0..5 {
        let file_name = format!("./Preset{i}.json");
        let cur_file = File::open(&file_name);
        match cur_file {
            Ok(file) => {
                presets.push(serde_json::from_reader(file).unwrap_or_default());
            }
            Err(err) => match err.kind() {
                ErrorKind::NotFound => {
                    let new_frontend_monitor_list: Vec<FrontendMonitor> = Vec::new();
                    let new_file = File::create(file_name);
                    if let Ok(new_file) = new_file {
                        let mut writer = BufWriter::new(new_file);
                        let to_writer_attempt =
                            serde_json::to_writer(&mut writer, &new_frontend_monitor_list);
                        if let Err(err) = to_writer_attempt {
                            return Err(err.to_string());
                        }
                        if io::Write::flush(&mut writer).is_err() {
                            return Err("Failed to flush wrtier".to_owned());
                        }
                        presets.push(new_frontend_monitor_list);
                    } else {
                        return Err(new_file.err().unwrap().to_string());
                    }
                }
                _ => {
                    return Err(err.to_string());
                }
            },
        }
    }
    return Ok(presets);
}
#[tauri::command]
async fn overwrite_preset(idx: i32, new_preset: Vec<FrontendMonitor>) -> Result<(), String> {
    let file_name = format!("./Preset{idx}.json");
    let new_file = File::create(file_name);
    if let Ok(new_file) = new_file {
        let mut writer = BufWriter::new(new_file);
        let to_writer_attempt = serde_json::to_writer(&mut writer, &new_preset);
        if let Err(err) = to_writer_attempt {
            return Err(err.to_string());
        }
        let flush_attempt = io::Write::flush(&mut writer);
        if let Err(err) = flush_attempt {
            return Err(err.to_string());
        }
    } else {
        return Err(new_file.err().unwrap().to_string());
    }
    return Ok(());
}
#[derive(Deserialize, Debug)]
struct MiniMonitor {
    output_xid: u64,
    enabled: bool,
    rotation: Rotation,
    mode_xid: u64,
    mode_height: u32,
    mode_width: u32,
    x: String,
    y: String,
}
#[tauri::command]
async fn quick_apply(monitors: Vec<MiniMonitor>) -> Result<Vec<Option<u64>>, XrandrError> {
    let mut xhandle = XHandle::open()?;
    let mut crtcs_changed: Vec<Crtc> = Vec::new();
    let mut crtc_ids: Vec<Option<u64>> = Vec::new();
    let res = ScreenResources::new(&mut xhandle).unwrap();
    let crtcs = res.crtcs(&mut xhandle)?;

    let outputs = res.outputs(&mut xhandle, Some(&crtcs), &res)?;
    for current_monitor in monitors {
        let current_output = outputs
            .iter()
            .find(|out| out.xid == current_monitor.output_xid)
            .unwrap();
        let mut crtc: Crtc;
        if current_monitor.enabled {
            //enable
            if current_output.current_mode.is_some() && current_output.crtc.is_some() {
                //crtc  was already enabled
                crtc = crtcs
                    .iter()
                    .find(|crt| crt.xid == current_output.crtc.unwrap())
                    .unwrap()
                    .clone();
            } else {
                //crtc needs to be enabled
                crtc = xhandle.find_available_crtc(&current_output, &res)?;
                crtc.outputs = vec![current_output.xid];
            }
            //position
            crtc.x = current_monitor.x.parse().unwrap();
            crtc.y = current_monitor.y.parse().unwrap();
            //mode
            crtc.mode = current_monitor.mode_xid;
            crtc.height = current_monitor.mode_height;
            crtc.width = current_monitor.mode_width;
            //rotation
            crtc.rotation = current_monitor.rotation;
            //finalize
            crtc_ids.push(Some(crtc.xid));
            crtcs_changed.push(crtc);
        } else {
            //Disable
            if let Some(crtc_id) = current_output.crtc {
                let mut crtc = crtcs.iter().find(|crt| crt.xid == crtc_id).unwrap().clone();
                crtc.x = 0;
                crtc.y = 0;
                crtc.mode = 0;
                crtc.rotation = Rotation::Normal;
                crtc.outputs.clear();
                crtcs_changed.push(crtc);
            }
            crtc_ids.push(None);
        }
    }
    xhandle.apply_new_crtcs(&mut crtcs_changed, &res)?;
    Ok(crtc_ids)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_monitors,
            set_primary,
            set_enabled,
            set_position,
            set_rotation,
            set_mode,
            get_presets,
            overwrite_preset,
            quick_apply
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
#[cfg(test)]
mod tests {
    use std::time::Instant;

    use super::*;

    fn handle() -> XHandle {
        XHandle::open().unwrap()
    }

    #[tokio::test]
    async fn speed_test_for_outputs() {
        let start = Instant::now();
        let monitors = get_monitors().await.unwrap();
        println!("Time taken: {:#?}", start.elapsed())
    }

    // #[test]
    // fn can_debug_format_monitors() {
    //     format!("{:#?}", handle().monitors().unwrap());
    // }
}
