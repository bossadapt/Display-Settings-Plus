use crate::XId;
use serde::Serialize;
use std::slice;
use x11::xrandr;

const RR_INTERLACE: u64 = 0x0000_0010;
const RR_DOUBLE_SCAN: u64 = 0x0000_0020;

// Modes correspond to the various display configurations the outputs
// connected to your machine are capable of displaying. This mostly comes
// down to resolution/refresh rates, but the `flags` field in particular
// also encodes whether this mode is interlaced/doublescan
//CUSTOM ADDED Serialize so that it works without reinitialization
#[derive(Debug, Clone, Serialize)]
pub struct Mode {
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

impl From<&xrandr::XRRModeInfo> for Mode {
    fn from(x_mode: &xrandr::XRRModeInfo) -> Self {
        let name_b =
            unsafe { slice::from_raw_parts(x_mode.name as *const u8, x_mode.nameLength as usize) };

        // Calculate the refresh rate for this mode
        // This is not given by xrandr, but tends to be useful for end-users
        assert!(
            x_mode.hTotal != 0 && x_mode.vTotal != 0,
            "Framerate calculation would divide by zero"
        );

        let v_total = if x_mode.modeFlags & RR_DOUBLE_SCAN != 0 {
            x_mode.vTotal * 2
        } else if x_mode.modeFlags & RR_INTERLACE != 0 {
            x_mode.vTotal / 2
        } else {
            x_mode.vTotal
        };

        let rate = x_mode.dotClock as f64 / (f64::from(x_mode.hTotal) * f64::from(v_total));

        Self {
            xid: x_mode.id,
            name: String::from_utf8_lossy(name_b).into_owned(),
            width: x_mode.width,
            height: x_mode.height,
            dot_clock: x_mode.dotClock,
            hsync_tart: x_mode.hSyncStart,
            hsync_end: x_mode.hSyncEnd,
            htotal: x_mode.hTotal,
            hskew: x_mode.hSkew,
            vsync_start: x_mode.vSyncStart,
            vsync_end: x_mode.vSyncEnd,
            vtotal: x_mode.vTotal,
            rate,
            flags: x_mode.modeFlags,
        }
    }
}
