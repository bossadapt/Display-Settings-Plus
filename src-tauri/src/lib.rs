use serde::Serialize;
use tauri::async_runtime::handle;
use xrandr::{Mode, Rotation, ScreenResources, XHandle, XId, XTime, XrandrError};
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
//added this to serialize without editing the library
#[derive(Serialize, Debug)]
struct FrontendMonitor {
    name: String,
    #[serde(rename(serialize = "isPrimary"))]
    is_primary: bool,
    #[serde(rename(serialize = "isAutomatic"))]
    is_automatic: bool,
    x: i32,
    y: i32,
    #[serde(rename(serialize = "widthPx"))]
    width_px: i32,
    #[serde(rename(serialize = "heightPx"))]
    height_px: i32,
    #[serde(rename(serialize = "widthMm"))]
    width_mm: i32,
    #[serde(rename(serialize = "heightMm"))]
    height_mm: i32,
    /// An Output describes an actual physical monitor or display. A [`Monitor`]
    /// can have more than one output.
    outputs: Vec<FrontendOutput>,
}
#[derive(Serialize, Debug)]
struct FrontendOutput {
    xid: XId,
    timestamp: XTime,
    #[serde(rename(serialize = "isPrimary"))]
    is_primary: bool,
    //might not want to pass this to the frontend in the future
    crtc: Option<XId>,
    //derived from crtc
    rotation: Rotation,
    name: String,
    #[serde(rename(serialize = "mmWidth"))]
    mm_width: u64,
    #[serde(rename(serialize = "mmHeight"))]
    mm_height: u64,
    connected: bool,
    #[serde(rename(serialize = "subpixelOrder"))]
    subpixel_order: u16,
    crtcs: Vec<XId>,
    clones: Vec<XId>,
    modes: Vec<Mode>,
    #[serde(rename(serialize = "preferredModes"))]
    preferred_modes: Vec<Mode>,
    #[serde(rename(serialize = "currentMode"))]
    current_mode: Option<Mode>,
}
//dropping properties because its too extra for someone editing settings via gui to care
#[tauri::command]
async fn get_monitors() -> Vec<FrontendMonitor> {
    let mut xhandle = XHandle::open().unwrap();
    let res = ScreenResources::new(&mut xhandle).unwrap();
    let monitors = xhandle.monitors().unwrap();
    //cant convert to intos due to dependencies on res and xhandle
    let output = monitors
        .iter()
        .map(|mon| FrontendMonitor {
            name: mon.name.clone(),
            is_primary: mon.is_primary,
            is_automatic: mon.is_automatic,
            x: mon.x,
            y: mon.y,
            width_px: mon.width_px,
            height_px: mon.height_px,
            width_mm: mon.width_mm,
            height_mm: mon.height_mm,
            outputs: mon
                .outputs
                .iter()
                .map(|out| FrontendOutput {
                    xid: out.xid,
                    timestamp: out.timestamp,
                    is_primary: out.is_primary,
                    crtc: out.crtc,
                    rotation: res
                        .crtc(&mut xhandle, out.crtc.unwrap())
                        .unwrap()
                        .rotation
                        .into(),
                    name: out.name.clone(),
                    mm_width: out.mm_width,
                    mm_height: out.mm_height,
                    connected: out.connected,
                    subpixel_order: out.subpixel_order,
                    crtcs: out.crtcs.clone(),
                    clones: out.clones.clone(),
                    modes: out
                        .modes
                        .iter()
                        .map(|mode_id| res.mode(*mode_id).unwrap())
                        .collect(),
                    preferred_modes: out
                        .preferred_modes
                        .iter()
                        .map(|mode_id| res.mode(*mode_id).unwrap())
                        .collect(),
                    current_mode: match out.current_mode {
                        Some(value) => Some(res.mode(value).unwrap()),
                        None => None,
                    },
                })
                .collect(),
        })
        .collect();
    // xhandle.set_rotation(output, rotation)
    // let test = ScreenResources::mode(xhandle);
    // println!("{:#?}", test.join("\n NEW \n"));

    //println!("MONITORS: \n {:#?}", output);

    output
}

#[tauri::command]
async fn set_primary(xid: u64) -> Result<(), XrandrError> {
    let mut xhandle = XHandle::open()?;
    xhandle.set_primary(xid);
    return Ok(());
}
#[tauri::command]
async fn set_enabled(xid: u64, enabled: bool) -> Result<(), XrandrError> {
    //setting up vars
    let mut xhandle = XHandle::open()?;
    let res = ScreenResources::new(&mut xhandle)?;
    let focused_output = res.output(&mut xhandle, xid)?;
    //making the change
    if enabled {
        xhandle.enable(&focused_output)?
    } else {
        xhandle.disable(&focused_output)?
    }
    return Ok(());
}
#[tauri::command]
async fn set_position(xid: u64, x: i32, y: i32) -> Result<(), XrandrError> {
    //setting up vars
    let mut xhandle = XHandle::open()?;
    let res = ScreenResources::new(&mut xhandle)?;
    let focused_output = res.output(&mut xhandle, xid)?;
    //making the change
    xhandle.set_position(&focused_output, x, y)?;
    return Ok(());
}
#[tauri::command]
async fn set_rotation(xid: u64, rotation: Rotation) -> Result<(), XrandrError> {
    //setting up vars
    let mut xhandle = XHandle::open()?;
    let res = ScreenResources::new(&mut xhandle)?;
    let focused_output = res.output(&mut xhandle, xid)?;
    //making the change
    xhandle.set_rotation(&focused_output, &rotation)?;
    return Ok(());
}
#[tauri::command]
async fn set_enable(xid: u64, enabled: bool) -> Result<(), XrandrError> {
    //setting up vars
    let mut xhandle = XHandle::open()?;
    let res = ScreenResources::new(&mut xhandle)?;
    let focused_output = res.output(&mut xhandle, xid)?;
    //making the change
    if enabled {
        xhandle.enable(&focused_output)?;
    } else {
        xhandle.disable(&focused_output)?;
    }
    return Ok(());
}
#[tauri::command]
async fn set_mode(output_xid: u64, mode: Mode) -> Result<(), XrandrError> {
    //setting up vars
    let mut xhandle = XHandle::open()?;
    let res = ScreenResources::new(&mut xhandle)?;
    let focused_output = res.output(&mut xhandle, output_xid)?;
    //making the change
    xhandle.set_mode(&focused_output, &mode)?;
    return Ok(());
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
            set_enable
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
