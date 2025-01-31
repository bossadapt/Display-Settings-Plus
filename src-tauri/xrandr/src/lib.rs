use itertools::EitherOrBoth as ZipEntry;
use itertools::Itertools;
use serde::Serialize;
use std::collections::HashMap;
use std::ffi::CStr;
use std::fmt::Debug;
use std::os::raw::c_ulong;
use std::ptr;

use crtc::normalize_positions;
pub use indexmap;
pub use screen_resources::ScreenResources;
use thiserror::Error;
use x11::{xlib, xrandr};

pub use crate::crtc::Crtc;
pub use crate::crtc::{Relation, Rotation};
pub use crate::mode::Mode;
pub use crate::monitor::Monitor;
use crate::monitor::MonitorHandle;
pub use crate::screensize::ScreenSize;
pub use output::{
    property::{Property, Range, Ranges, Supported, Value, Values},
    Output,
};

mod crtc;
mod mode;
mod monitor;
mod output;
mod screen_resources;
mod screensize;

// All retrieved information is timestamped by when that information was
// last changed in the backend. If we alter an object (e.g. crtc, output) we
// have to pass the timestamp we got with it. If the x backend detects that
// changes have occured since we retrieved the information, our new change
// will not go through.
pub type XTime = c_ulong;
// Xrandr seems to want the time `0` when calling setter functions
const CURRENT_TIME: c_ulong = 0;
// Unique identifiers for the various objects in the x backend
// (crtcs,outputs,modes, etc.)
pub type XId = c_ulong;

// The main handle consists simply of a pointer to the display
type HandleSys = ptr::NonNull<xlib::Display>;
#[derive(Debug)]
pub struct XHandle {
    sys: HandleSys,
}

impl XHandle {
    /// Open a handle to the lib-xrandr backend. This will be
    /// used for nearly all interactions with the xrandr lib
    ///
    /// # Errors
    /// * `XrandrError::Open` - Getting the handle failed.
    ///
    /// # Examples
    /// ```
    /// let xhandle = XHandle.open()?;
    /// let mon1 = xhandle.monitors()?[0];
    /// ```
    ///
    pub fn open() -> Result<Self, XrandrError> {
        // XOpenDisplay argument is screen name
        // Null pointer gets first display?
        let sys = ptr::NonNull::new(unsafe { xlib::XOpenDisplay(ptr::null()) })
            .ok_or(XrandrError::Open)?;

        Ok(Self { sys })
    }

    /// List every monitor
    ///
    /// # Errors
    /// * `XrandrError::_` - various calls to the xrandr backend may fail
    ///
    /// # Examples
    /// ```
    /// let mon1 = xhandle.monitors()?[0];
    /// ```
    ///
    pub fn monitors(&mut self) -> Result<Vec<Monitor>, XrandrError> {
        let infos = MonitorHandle::new(self)?;

        infos
            .as_slice()
            .iter()
            .map(|sys| {
                let outputs = unsafe { Output::from_list(self, sys.outputs, sys.noutput) }?;

                Ok(Monitor {
                    name: atom_name(&mut self.sys, sys.name)?,
                    is_primary: real_bool(sys.primary),
                    is_automatic: real_bool(sys.automatic),
                    x: sys.x,
                    y: sys.y,
                    width_px: sys.width,
                    height_px: sys.height,
                    width_mm: sys.mwidth,
                    height_mm: sys.mheight,
                    outputs,
                })
            })
            .collect::<Result<_, _>>()
    }

    /// List every monitor's outputs
    ///
    /// # Errors
    /// * `XrandrError::_` - various calls to the xrandr backend may fail
    ///
    /// # Examples
    /// ```
    /// let dp_1 = xhandle.all_outputs()?[0];
    /// ```
    ///
    pub fn all_outputs(&mut self) -> Result<Vec<Output>, XrandrError> {
        ScreenResources::new(self)?.outputs(self)
    }

    // TODO: this seems to be more complicated in xrandr.c
    // Finds an available Crtc for a given (disabled) output
    fn find_available_crtc(&mut self, o: &Output) -> Result<Crtc, XrandrError> {
        let res = ScreenResources::new(self)?;
        let crtcs = res.crtcs(self)?;

        for crtc in crtcs {
            if crtc.possible.contains(&o.xid) && crtc.outputs.is_empty() {
                return Ok(crtc);
            }
        }

        Err(XrandrError::NoCrtcAvailable)
    }

    /// Enable the given output by setting it to its preferred mode
    ///
    /// # Errors
    /// * `XrandrError::_` - various calls to the xrandr backend may fail
    ///
    /// # Examples
    /// ```
    /// let dp_1 = xhandle.all_outputs()?[0];
    /// xhandle.enable(dp_1)?;
    /// ```
    ///
    pub fn enable(&mut self, output: &Output) -> Result<(), XrandrError> {
        if output.current_mode.is_some() {
            return Ok(());
        }

        let target_mode = output
            .preferred_modes
            .first()
            .ok_or(XrandrError::NoPreferredModes(output.xid))?;

        let mut crtc = self.find_available_crtc(output)?;
        let mode = ScreenResources::new(self)?.mode(*target_mode)?;

        crtc.mode = mode.xid;
        crtc.width = mode.width;
        crtc.height = mode.height;
        crtc.outputs = vec![output.xid];

        self.apply_new_crtcs(&mut [crtc])
    }

    /// Disable the given output
    ///
    /// # Errors
    /// * `XrandrError::_` - various calls to the xrandr backend may fail
    ///
    /// # Examples
    /// ```
    /// let dp_1 = xhandle.all_outputs()?[0];
    /// xhandle.disable(dp_1)?;
    /// ```
    ///
    pub fn disable(&mut self, output: &Output) -> Result<(), XrandrError> {
        let crtc_id = match output.crtc {
            None => return Ok(()),
            Some(xid) => xid,
        };

        let res = ScreenResources::new(self)?;
        let mut crtc = res.crtc(self, crtc_id)?;
        crtc.set_disable();

        self.apply_new_crtcs(&mut [crtc])
    }

    /// Sets the given output as the primary output
    ///
    /// # Errors
    /// * `XrandrError::_` - various calls to the xrandr backend may fail
    ///
    /// # Examples
    /// ```
    /// let dp_1 = xhandle.all_outputs()?[0];
    /// xhandle.set_primary(dp_1)?;
    /// ```
    /// localy edited to use xid upfront to save the time of passing objects back and forth
    pub fn set_primary(&mut self, xid: u64) {
        unsafe {
            xrandr::XRRSetOutputPrimary(self.sys.as_ptr(), self.root(), xid);
        }
    }

    // - xrandr does not seem to resize after a rotation, and this feels
    //   similar to me. I would say let the user reposition the displays
    /// Sets the mode of a given output, relative to another
    ///
    /// # Arguments
    /// * `output` - The output to change mode for
    /// * `mode` - The mode to change to
    ///
    /// # Errors
    /// * `XrandrError::_` - various calls to the xrandr backend may fail
    ///
    /// # Examples
    /// ```
    /// let dp_1 = xhandle.all_outputs()?[0];
    /// let mode = dp_1.preferred_modes[0];
    /// xhandle.set_mode(dp_1, mode)?;
    /// ```
    ///
    pub fn set_mode(&mut self, output: &Output, mode: &Mode) -> Result<(), XrandrError> {
        let crtc_id = output
            .crtc
            .ok_or(XrandrError::OutputDisabled(output.name.clone()))?;
        let mut crtc = ScreenResources::new(self)?.crtc(self, crtc_id)?;

        crtc.mode = mode.xid;
        self.apply_new_crtcs(&mut [crtc])
    }

    /// Sets the position of a given output, relative to another
    ///
    /// # Arguments
    /// * `output` - The output to reposition
    /// * `relation` - The relation `output` will have to `rel_output`
    /// * `rel_output` - The output to position relative to
    ///
    /// # Errors
    /// * `XrandrError::_` - various calls to the xrandr backend may fail
    ///
    /// # Examples
    /// ```
    /// let dp_1 = outputs[0];
    /// let hdmi_1 = outputs[3];
    /// xhandle.set_position(dp_1, Relation::LeftOf, hdmi_1)?;
    /// ```
    ///
    pub fn set_position_relative(
        &mut self,
        output: &Output,
        relation: &Relation,
        relative_output: &Output,
    ) -> Result<(), XrandrError> {
        let crtc_id = output
            .crtc
            .ok_or(XrandrError::OutputDisabled(output.name.clone()))?;
        let rel_crtc_id = relative_output
            .crtc
            .ok_or(XrandrError::OutputDisabled(relative_output.name.clone()))?;

        let res = ScreenResources::new(self)?;
        let mut crtc = res.crtc(self, crtc_id)?;
        let rel_crtc = res.crtc(self, rel_crtc_id)?;

        // Calculate new (x,y) based on:
        // - own width/height & relative output's width/height/x/y
        let (w, h) = (crtc.width as i32, crtc.height as i32);
        let (rel_w, rel_h) = (rel_crtc.width as i32, rel_crtc.height as i32);
        let (rel_x, rel_y) = (rel_crtc.x, rel_crtc.y);

        (crtc.x, crtc.y) = match relation {
            Relation::LeftOf => (rel_x - w, rel_y),
            Relation::RightOf => (rel_x + rel_w, rel_y),
            Relation::Above => (rel_x, rel_y - h),
            Relation::Below => (rel_x, rel_y + rel_h),
            Relation::SameAs => (rel_x, rel_y),
        };

        self.apply_new_crtcs(&mut [crtc])
    }

    ///Custom specific position setter
    pub fn set_position(&mut self, output: &Output, x: i32, y: i32) -> Result<(), XrandrError> {
        let crtc_id = output
            .crtc
            .ok_or(XrandrError::OutputDisabled(output.name.clone()))?;

        let res = ScreenResources::new(self)?;
        let mut crtc = res.crtc(self, crtc_id)?;
        crtc.x = x;
        crtc.y = y;
        self.apply_new_crtcs(&mut [crtc])
    }
    /// Sets the position of a given output, relative to another
    ///
    /// # Arguments
    /// * `output` - The output to rotate
    /// * `rotation`
    ///
    /// # Errors
    /// * `XrandrError::_` - various calls to the xrandr backend may fail
    ///
    /// # Examples
    /// ```
    /// let dp_1 = outputs[0];
    /// xhandle.set_rotation(dp_1, Rotation::Inverted)?;
    /// ```
    ///
    pub fn set_rotation(
        &mut self,
        output: &Output,
        rotation: &Rotation,
    ) -> Result<(), XrandrError> {
        let crtc_id = output
            .crtc
            .ok_or(XrandrError::OutputDisabled(output.name.clone()))?;

        let res = ScreenResources::new(self)?;
        let mut crtc = res.crtc(self, crtc_id)?;

        (crtc.width, crtc.height) = crtc.rotated_size(*rotation);
        crtc.rotation = *rotation;

        self.apply_new_crtcs(&mut [crtc])
    }

    /// Applies some set of altered crtcs
    /// Due to xrandr's structure, changing one or more crtcs properly can be
    /// quite complicated. One should therefore call this function on any crtcs
    /// that you want to change.
    /// # Arguments
    /// * `changes`
    ///     Altered crtcs. Must be mutable because of crct.apply() calls.
    ///
    fn apply_new_crtcs(&mut self, changed: &mut [Crtc]) -> Result<(), XrandrError> {
        let res = ScreenResources::new(self)?;
        let old_crtcs = res.enabled_crtcs(self)?;

        // Construct new crtcs out of the old ones and the new where provided
        let mut changed_map: HashMap<XId, Crtc> = HashMap::new();
        changed.iter().cloned().for_each(|c| {
            changed_map.insert(c.xid, c);
        });

        let mut new_crtcs: Vec<Crtc> = Vec::new();
        for crtc in &old_crtcs {
            match changed_map.remove(&crtc.xid) {
                None => new_crtcs.push(crtc.clone()),
                Some(c) => new_crtcs.push(c.clone()),
            }
        }
        new_crtcs.extend(changed_map.drain().map(|(_, v)| v));

        // In case the top-left corner is no longer at (0,0), renormalize
        normalize_positions(&mut new_crtcs);
        let new_size = ScreenSize::fitting_crtcs(self, &new_crtcs);

        // Disable crtcs that do not fit before setting the new size
        // Note that this should only be crtcs that were changed, but `changed`
        // contains the already altered crtc, so we have to use `old_crtcs`
        let mut old_crtcs = old_crtcs;
        for crtc in &mut old_crtcs {
            if !new_size.fits_crtc(crtc) {
                crtc.set_disable();
                crtc.apply(self)?;
            }
        }
        self.set_screensize(&new_size);

        // Find the crtcs that were changed. Done this late to also account
        // for crtcs that were altered by normalize_positions()
        let mut to_apply: Vec<&mut Crtc> = Vec::new();
        for pair in old_crtcs.iter().zip_longest(new_crtcs.iter_mut()) {
            match pair {
                ZipEntry::Both(old, new) => {
                    assert!(old.xid == new.xid, "invalid new_crtcs");
                    if new.timestamp < old.timestamp {
                        return Err(XrandrError::CrtcChanged(new.xid));
                    }
                    if new != old {
                        to_apply.push(new);
                    }
                }
                ZipEntry::Right(new) => to_apply.push(new),
                ZipEntry::Left(_) => unreachable!("invalid new_crtcs"),
            }
        }

        // Move and re-enable the crtcs
        to_apply.iter_mut().try_for_each(|c| c.apply(self))
    }

    /// Sets the screen size in the x backend
    fn set_screensize(&mut self, size: &ScreenSize) {
        unsafe {
            xrandr::XRRSetScreenSize(
                self.sys.as_ptr(),
                self.root(),
                size.width,
                size.height,
                size.width_mm,
                size.height_mm,
            );
        }
    }

    fn root(&mut self) -> c_ulong {
        unsafe { xlib::XDefaultRootWindow(self.sys.as_ptr()) }
    }
}

impl Drop for XHandle {
    fn drop(&mut self) {
        unsafe { xlib::XCloseDisplay(self.sys.as_ptr()) };
    }
}

fn real_bool(sys: xlib::Bool) -> bool {
    assert!(
        sys == 0 || sys == 1,
        "Integer larger than 1 does not represent a bool"
    );
    sys == 1
}

fn atom_name(handle: &mut HandleSys, atom: xlib::Atom) -> Result<String, XrandrError> {
    let chars = ptr::NonNull::new(unsafe { xlib::XGetAtomName(handle.as_ptr(), atom) })
        .ok_or(XrandrError::GetAtomName(atom))?;

    let name = unsafe { CStr::from_ptr(chars.as_ptr()) }
        .to_string_lossy()
        .to_string();

    unsafe {
        xlib::XFree(chars.as_ptr().cast());
    }

    Ok(name)
}

#[derive(Error, Debug, Serialize)]
pub enum XrandrError {
    #[error("Failed to open connection to x11.")]
    Open,

    #[error("Call to XRRGetMonitors failed.")]
    GetMonitors,

    #[error("No CRTC available to put onto new output")]
    NoCrtcAvailable,

    #[error("Call to XRRGetScreenResources for XRRDefaultRootWindow failed")]
    GetResources,

    #[error("The output '{0}' is disabled")]
    OutputDisabled(String),

    #[error("Invalid rotation: {0}")]
    InvalidRotation(u16),

    #[error("Could not get info on mode with xid {0}")]
    GetMode(xlib::XID),

    #[error("Crtc changed since last requesting its state")]
    CrtcChanged(xlib::XID),

    #[error("Call to XRRGetCrtcInfo for CRTC with xid {0} failed")]
    GetCrtcInfo(xlib::XID),

    #[error("Failed to get Crtc: No Crtc with ID {0}")]
    GetCrtc(xlib::XID),

    #[error("Call to XRRGetOutputInfo for output with xid {0} failed")]
    GetOutputInfo(xlib::XID),

    #[error("No preferred modes found for output with xid {0}")]
    NoPreferredModes(xlib::XID),

    #[error("No mode found with xid {0}")]
    GetModeInfo(xlib::XID),

    #[error("Failed to get the properties of output with xid {0}")]
    GetOutputProp(xlib::XID),

    #[error("Failed to name of atom {0}")]
    GetAtomName(xlib::Atom),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn handle() -> XHandle {
        XHandle::open().unwrap()
    }

    #[test]
    fn can_open() {
        handle();
    }

    #[test]
    fn can_debug_format_monitors() {
        format!("{:#?}", handle().monitors().unwrap());
    }
}
