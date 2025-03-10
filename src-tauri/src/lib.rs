use std::{
    fs::File,
    io::{self, BufWriter},
    path,
};

use serde::{Deserialize, Serialize};
use tokio::fs::{create_dir_all, read_dir, remove_file};
use xcap::{image::ImageError, XCapError};
use xrandr::{Crtc, Mode, Rotation, ScreenResources, XHandle, XId, XrandrError};

#[derive(Serialize, Deserialize, Debug)]
struct Preset {
    name: String,
    monitors: Vec<FrontendMonitor>,
}
#[derive(Serialize, Deserialize, Debug)]
struct FrontendMonitor {
    name: String,
    #[serde(rename = "imgSrc")]
    img_src: Option<String>,
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
fn mode_from_list(modes: Vec<Mode>, mode_list: &Vec<u64>) -> Vec<Mode> {
    return modes
        .into_iter()
        .filter(|mode| mode_list.contains(&mode.xid))
        .collect();
}
#[derive(Serialize, Debug)]
enum GenericError {
    Serde(String),
    Xcap(String),
    Xrandr(XrandrError),
    Io(String),
}

impl From<serde_json::Error> for GenericError {
    fn from(e: serde_json::Error) -> Self {
        GenericError::Serde(e.to_string())
    }
}
impl From<XrandrError> for GenericError {
    fn from(e: XrandrError) -> Self {
        GenericError::Xrandr(e)
    }
}
impl From<XCapError> for GenericError {
    fn from(e: XCapError) -> Self {
        GenericError::Xcap(e.to_string())
    }
}
impl From<ImageError> for GenericError {
    fn from(e: ImageError) -> Self {
        GenericError::Xcap(e.to_string())
    }
}
impl From<io::Error> for GenericError {
    fn from(e: io::Error) -> Self {
        GenericError::Io(e.to_string())
    }
}
use lazy_static::lazy_static;
lazy_static! {
    static ref app_directory_path: path::PathBuf = directories::BaseDirs::new()
        .unwrap()
        .config_dir()
        .join("display_settings_plus");
}
#[tauri::command]
async fn get_monitors() -> Result<(Vec<FrontendMonitor>, Vec<String>), GenericError> {
    create_dir_all(app_directory_path.join("screenshots")).await?;
    create_dir_all(app_directory_path.join("presets")).await?;
    let mut xhandle = XHandle::open()?;
    let res = ScreenResources::new(&mut xhandle)?;
    let crtcs = res.crtcs(&mut xhandle)?;
    let modes = res.modes();
    let outputs = res.outputs(&mut xhandle, Some(&crtcs), &res)?;
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
                img_src: None,
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

    //handle inactive screens
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
                img_src: None,
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

    let mut connected_monitors: Vec<FrontendMonitor> = Vec::new();
    for monitor in enabled_monitors {
        connected_monitors.push(monitor);
    }
    for monitor in disabled_monitors {
        connected_monitors.push(monitor);
    }
    for (name, path) in take_screenshots()? {
        connected_monitors
            .iter_mut()
            .find(|mon| mon.name == name)
            .unwrap()
            .img_src = Some(path);
    }

    Ok((
        connected_monitors,
        outputs.iter().map(|out| out.name.clone()).collect(),
    ))
}

fn take_screenshots() -> Result<Vec<(String, String)>, ImageError> {
    let screenshot_monitors = xcap::Monitor::all().unwrap();
    let mut paths: Vec<(String, String)> = Vec::new();
    for monitor in screenshot_monitors {
        let cur_name = monitor.name();
        let file_name = app_directory_path.join(format!("screenshots/{cur_name}.png"));
        paths.push((cur_name.to_owned(), file_name.to_str().unwrap().to_owned()));
        monitor.capture_image().unwrap().save(file_name)?;
    }
    Ok(paths)
}
#[tauri::command]
async fn set_primary(xid: u64) -> Result<(), XrandrError> {
    let mut xhandle = XHandle::open()?;
    xhandle.set_primary(xid);
    return Ok(());
}
//uses strings to parce because javascript round ,ciel and trunc make numbers like 1920.0 or 0.999999999999999999432 and im bored of it
//Cannot realistically apply positions once at a time due to normalization pushing monitors to the left
#[derive(Deserialize, Debug)]
struct PositionProps {
    output_crtc: Option<u64>,
    x: String,
    y: String,
}
#[tauri::command]
async fn set_positions(props: Vec<PositionProps>) -> Result<(), XrandrError> {
    //sort props
    let mut crtcs: Vec<Crtc> = Vec::new();
    let mut xhandle: XHandle = XHandle::open()?;
    let res = ScreenResources::new(&mut xhandle)?;
    println!("{:?}", props);
    for prop in props {
        if let Some(crtc_id) = prop.output_crtc {
            //setting up vars
            //shadow the dumb strings
            let x: i32 = prop.x.parse().unwrap();
            let y: i32 = prop.y.parse().unwrap();
            //making the change
            println!("position set x:{}, y:{}", x, y);
            let mut crtc = res.crtc(&mut xhandle, crtc_id)?;
            crtc.x = x;
            crtc.y = y;
            crtcs.push(crtc);
        } else {
            println!("did not update cus no id");
        }
    }
    xhandle.apply_new_crtcs(&mut crtcs, &res)?;
    return Ok(());
}
#[tauri::command]
async fn set_rotation(output_crtc: Option<u64>, rotation: Rotation) -> Result<(), XrandrError> {
    //setting up vars
    if let Some(crtc_id) = output_crtc {
        let mut xhandle = XHandle::open()?;
        xhandle.set_rotation(crtc_id, &rotation)?;
    } else {
        return Err(XrandrError::OutputDisabled("".to_owned()));
    }
    return Ok(());
}
///returns crtc after enabling monitor
#[tauri::command]
async fn set_enabled(xid: u64, enabled: bool) -> Result<u64, XrandrError> {
    //setting up vars
    println!("enabled set as {} for {}", enabled, xid);
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
    output_crtc: Option<u64>,
    mode_xid: u64,
    mode_height: u32,
    mode_width: u32,
) -> Result<(), XrandrError> {
    if let Some(crtc_id) = output_crtc {
        let mut xhandle = XHandle::open()?;
        let res = ScreenResources::new(&mut xhandle)?;
        xhandle.set_mode(crtc_id, mode_xid, mode_height, mode_width, &res)?;
    } else {
        return Err(XrandrError::OutputDisabled("".to_owned()));
    }
    return Ok(());
}

#[tauri::command]
async fn get_presets() -> Result<Vec<Preset>, GenericError> {
    let mut presets: Vec<Preset> = Vec::new();
    let mut files_in_presets = read_dir(app_directory_path.join(format!("presets/"))).await?;
    while let Some(file) = files_in_presets.next_entry().await? {
        let file_path = file.path();
        if file_path.extension().and_then(|ext| ext.to_str()) == Some("json") {
            let file_name = file.file_name().to_string_lossy().to_string();
            let file_content = tokio::fs::read_to_string(&file_path).await?;
            let monitors = serde_json::from_str::<Vec<FrontendMonitor>>(&file_content)?;
            let name = file_name[..file_name.len() - 5].to_owned();
            presets.push(Preset { name, monitors })
        }
    }
    return Ok(presets);
}
///Used by both overwrite preset and create preset
#[tauri::command]
async fn create_preset(preset: Preset) -> Result<(), GenericError> {
    let file_name = app_directory_path.join(format!("presets/{}.json", preset.name));
    let new_file = File::create(file_name)?;
    let mut writer = BufWriter::new(new_file);
    serde_json::to_writer(&mut writer, &preset.monitors)?;
    io::Write::flush(&mut writer)?;
    return Ok(());
}
#[tauri::command]
async fn delete_preset(preset_name: String) -> Result<(), GenericError> {
    let file_name = app_directory_path.join(format!("presets/{preset_name}.json"));
    remove_file(file_name).await?;
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
    println!("Mass/Quick Applying:");
    println!("{:#?}", monitors);
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
//TODO: add a script maker
//https://askubuntu.com/questions/63681/how-can-i-make-xrandr-customization-permanent
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_monitors,
            set_primary,
            set_enabled,
            set_positions,
            set_rotation,
            set_mode,
            get_presets,
            create_preset,
            delete_preset,
            quick_apply
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
#[cfg(test)]
mod tests {
    use std::time::Instant;

    use super::*;

    #[tokio::test]
    async fn speed_test_for_outputs() {
        let start = Instant::now();
        let _monitors = get_monitors().await.unwrap();
        println!("Time taken: {:#?}", start.elapsed())
    }

    // #[test]
    // fn can_debug_format_monitors() {
    //     format!("{:#?}", handle().monitors().unwrap());
    // }
}
