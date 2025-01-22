use serde::Serialize;
use xrandr::{XHandle, XId, XTime};
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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
    crtc: Option<XId>,
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
    modes: Vec<XId>,
    #[serde(rename(serialize = "preferredModes"))]
    preferred_modes: Vec<XId>,
    #[serde(rename(serialize = "currentMode"))]
    current_mode: Option<XId>,
}
//dropping properties because its too extra for someone editing settings via gui to care
#[tauri::command]
fn get_monitors() -> Vec<FrontendMonitor> {
    let mut xhandle = XHandle::open().unwrap();
    let monitors = xhandle.monitors().unwrap();
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
                    name: out.name.clone(),
                    mm_width: out.mm_width,
                    mm_height: out.mm_height,
                    connected: out.connected,
                    subpixel_order: out.subpixel_order,
                    crtcs: out.crtcs.clone(),
                    clones: out.clones.clone(),
                    modes: out.modes.clone(),
                    preferred_modes: out.preferred_modes.clone(),
                    current_mode: out.current_mode,
                })
                .collect(),
        })
        .collect();
    //println!("MONITORS: \n {:#?}", output);
    output
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_monitors])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
