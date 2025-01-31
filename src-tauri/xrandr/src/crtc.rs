use crate::screen_resources::ScreenResourcesHandle;
use crate::XHandle;
use crate::XId;
use crate::XTime;
use crate::XrandrError;
use crate::CURRENT_TIME;
use std::ptr;
use std::slice;

use serde::Deserialize;
use serde::Serialize;
use std::convert::TryFrom;
use x11::xrandr;

// A Crtc can display a mode in one of 4 rotations
#[derive(Serialize, Deserialize, PartialEq, Eq, Copy, Debug, Clone)]
pub enum Rotation {
    Normal = 1,
    Left = 2,
    Inverted = 4,
    Right = 8,
}

impl TryFrom<u16> for Rotation {
    type Error = XrandrError;

    fn try_from(r: u16) -> Result<Self, Self::Error> {
        match r {
            1 => Ok(Rotation::Normal),
            2 => Ok(Rotation::Left),
            4 => Ok(Rotation::Inverted),
            8 => Ok(Rotation::Right),
            _ => Err(XrandrError::InvalidRotation(r)),
        }
    }
}

// A Crtc can be positioned relative to another one in one of five directions
#[derive(Copy, Debug, Clone)]
pub enum Relation {
    LeftOf,
    RightOf,
    Above,
    Below,
    SameAs,
}

// Crtcs define a region of pixels you can see. The Crtc controls the size
// and timing of the signal. To this end, the Crtc struct in xrandr maintains
// a list of attributes that usually correspond to a physical display.
#[derive(PartialEq, Eq, Debug, Clone)]
pub struct Crtc {
    pub xid: XId,
    pub timestamp: XTime,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub mode: XId,
    pub rotation: Rotation,
    pub outputs: Vec<XId>,
    pub rotations: u16,
    pub possible: Vec<XId>,
}

/// Normalizes a set of Crtcs by making sure the top left pixel of the screen
/// is at (0,0). This is needed after changing positions/rotations.
pub(crate) fn normalize_positions(crtcs: &mut Vec<Crtc>) {
    if crtcs.is_empty() {
        return;
    };

    let left = crtcs.iter().map(|p| p.x).min().unwrap();
    let top = crtcs.iter().map(|p| p.y).min().unwrap();
    if (top, left) == (0, 0) {
        return;
    };

    for c in crtcs.iter_mut() {
        c.offset((-left, -top));
    }
}

// A wrapper that drops the pointer if it goes out of scope.
// Avoid having to deal with the various early returns
struct CrtcHandle {
    ptr: ptr::NonNull<xrandr::XRRCrtcInfo>,
}

impl CrtcHandle {
    fn new(handle: &mut XHandle, xid: XId) -> Result<Self, XrandrError> {
        let res = ScreenResourcesHandle::new(handle)?;

        let raw_ptr = unsafe { xrandr::XRRGetCrtcInfo(handle.sys.as_ptr(), res.ptr(), xid) };

        let ptr = ptr::NonNull::new(raw_ptr).ok_or(XrandrError::GetCrtcInfo(xid))?;

        Ok(Self { ptr })
    }
}

impl Drop for CrtcHandle {
    fn drop(&mut self) {
        unsafe { xrandr::XRRFreeCrtcInfo(self.ptr.as_ptr()) };
    }
}

impl Crtc {
    /// Open a handle to the lib-xrandr backend. This will be
    /// used for nearly all interactions with the xrandr lib
    ///
    /// # Arguments
    /// * `handle` - The xhandle to make the x calls with
    /// * `xid` - The internal XID of the requested crtc
    ///
    /// # Errors
    /// * `XrandrError::GetCrtc(xid)` - Could not find this xid.
    ///
    /// # Examples
    /// ```
    /// let xhandle = XHandle.open()?;
    /// let mon1 = xhandle.monitors()?[0];
    /// ```
    ///
    pub fn from_xid(handle: &mut XHandle, xid: XId) -> Result<Self, XrandrError> {
        let crtc_info = CrtcHandle::new(handle, xid)?;

        let xrandr::XRRCrtcInfo {
            timestamp,
            x,
            y,
            width,
            height,
            mode,
            rotation,
            noutput,
            outputs,
            rotations,
            npossible,
            possible,
        } = unsafe { crtc_info.ptr.as_ref() };

        let rotation = Rotation::try_from(*rotation)?;

        let outputs = unsafe { slice::from_raw_parts(*outputs, *noutput as usize) };

        let possible = unsafe { slice::from_raw_parts(*possible, *npossible as usize) };

        Ok(Self {
            xid,
            timestamp: *timestamp,
            x: *x,
            y: *y,
            width: *width,
            height: *height,
            mode: *mode,
            rotation,
            outputs: outputs.to_vec(),
            rotations: *rotations,
            possible: possible.to_vec(),
        })
    }

    /// Apply the current fields of this crtc. `&mut self` needed to create a
    /// mut pointer to outputs, which lib-xrandr seems to require.
    /// # Examples
    /// ```
    /// // Sets new mode on the crtc of some output
    /// let mut crtc = ScreenResources::new(self)?.crtc(self, output.crtc)?;
    /// crtc.mode = mode.xid;
    /// crtc.apply(xhandle)
    /// ```
    ///
    pub(crate) fn apply(&mut self, handle: &mut XHandle) -> Result<(), XrandrError> {
        let outputs = match self.outputs.len() {
            0 => std::ptr::null_mut(),
            _ => self.outputs.as_mut_ptr(),
        };

        let res = ScreenResourcesHandle::new(handle)?;

        unsafe {
            xrandr::XRRSetCrtcConfig(
                handle.sys.as_ptr(),
                res.ptr(),
                self.xid,
                CURRENT_TIME,
                self.x,
                self.y,
                self.mode,
                self.rotation as u16,
                outputs,
                i32::try_from(self.outputs.len()).unwrap(),
            );
        }

        Ok(())
    }

    /// Alters some fields to reflect the disabled state
    /// Use apply() afterwards to actually disable the crtc
    pub(crate) fn set_disable(&mut self) {
        self.x = 0;
        self.y = 0;
        self.mode = 0;
        self.rotation = Rotation::Normal;
        self.outputs.clear();
    }

    /// Width and height, accounting for a given rotation
    #[must_use]
    pub fn rotated_size(&self, rot: Rotation) -> (u32, u32) {
        let (w, h) = (self.width, self.height);

        let (old_w, old_h) = match self.rotation {
            Rotation::Normal | Rotation::Inverted => (w, h),
            Rotation::Left | Rotation::Right => (h, w),
        };

        match rot {
            Rotation::Normal | Rotation::Inverted => (old_w, old_h),
            Rotation::Left | Rotation::Right => (old_h, old_w),
        }
    }

    /// The most down an dright coordinates that this crtc uses
    pub(crate) fn max_coordinates(&self) -> (i32, i32) {
        assert!(
            self.x >= 0 && self.y >= 0,
            "max_coordinates should be called on normalized crtc"
        );

        // let (w, h) = self.rot_size();
        // I think crtcs have this incorporated in their width/height fields
        (self.x + self.width as i32, self.y + self.height as i32)
    }

    /// Creates a new Crtc that is offset (.x and .y) fields, by offset param
    pub(crate) fn offset(&mut self, offset: (i32, i32)) {
        let x = i64::from(self.x) + i64::from(offset.0);
        let y = i64::from(self.y) + i64::from(offset.1);

        assert!(
            x < i64::from(i32::MAX) && y < i64::from(i32::MAX),
            "This offset would cause integer overflow"
        );

        assert!(x >= 0 && y >= 0, "Invalid coordinates after offset");

        self.x = i32::try_from(x).unwrap();
        self.y = i32::try_from(y).unwrap();
    }
}
