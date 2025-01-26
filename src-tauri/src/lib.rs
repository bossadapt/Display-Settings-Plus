use serde::Serialize;
use tauri::async_runtime::handle;
use xrandr::{Mode, ScreenResources, XHandle, XId, XTime};
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
enum FrontendRotation {
    Normal = 1,
    Left = 2,
    Inverted = 4,
    Right = 8,
}
impl From<xrandr::Rotation> for FrontendRotation {
    fn from(value: xrandr::Rotation) -> Self {
        match value {
            xrandr::Rotation::Normal => FrontendRotation::Normal,
            xrandr::Rotation::Left => FrontendRotation::Left,
            xrandr::Rotation::Inverted => FrontendRotation::Inverted,
            xrandr::Rotation::Right => FrontendRotation::Right,
        }
    }
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
    rotation: FrontendRotation,
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
    modes: Vec<FrontendMode>,
    #[serde(rename(serialize = "preferredModes"))]
    preferred_modes: Vec<FrontendMode>,
    #[serde(rename(serialize = "currentMode"))]
    current_mode: Option<FrontendMode>,
}

#[derive(Serialize, Debug, Clone)]
pub struct FrontendMode {
    pub xid: XId,
    pub width: u32,
    pub height: u32,
    pub dot_clock: u64,
    pub hsync_tart: u32,
    pub hsync_end: u32,
    pub htotal: u32,
    pub hskew: u32,
    pub vsync_start: u32,
    pub vsync_end: u32,
    pub vtotal: u32,
    pub name: String,
    pub flags: u64,
    pub rate: f64,
}
impl From<Mode> for FrontendMode {
    fn from(value: Mode) -> Self {
        FrontendMode {
            xid: value.xid,
            width: value.width,
            height: value.height,
            dot_clock: value.dot_clock,
            hsync_tart: value.hsync_tart,
            hsync_end: value.hsync_end,
            htotal: value.htotal,
            hskew: value.hskew,
            vsync_start: value.vsync_start,
            vsync_end: value.vsync_end,
            vtotal: value.vtotal,
            name: value.name,
            flags: value.flags,
            rate: value.rate,
        }
    }
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
                        .map(|mode_id| res.mode(*mode_id).unwrap().into())
                        .collect(),
                    preferred_modes: out
                        .preferred_modes
                        .iter()
                        .map(|mode_id| res.mode(*mode_id).unwrap().into())
                        .collect(),
                    current_mode: match out.current_mode {
                        Some(value) => Some(res.mode(value).unwrap().into()),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_monitors])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
