use crate::output::Output;
use crate::XHandle;
use crate::XrandrError;
use core::ptr;
use std::slice;
use x11::xrandr;

// A wrapper that drops the pointer if it goes out of scope.
// Avoid having to deal with the various early returns
pub(crate) struct MonitorHandle {
    ptr: ptr::NonNull<xrandr::XRRMonitorInfo>,
    count: i32,
}

impl MonitorHandle {
    pub(crate) fn new(handle: &mut XHandle) -> Result<Self, XrandrError> {
        let mut count = 0;

        let raw_ptr =
            unsafe { xrandr::XRRGetMonitors(handle.sys.as_ptr(), handle.root(), 0, &mut count) };

        if count == -1 {
            return Err(XrandrError::GetMonitors);
        }

        let ptr = ptr::NonNull::new(raw_ptr).ok_or(XrandrError::GetMonitors)?;

        Ok(Self { ptr, count })
    }

    pub(crate) fn as_slice(&self) -> &[xrandr::XRRMonitorInfo] {
        unsafe { slice::from_raw_parts_mut(self.ptr.as_ptr(), self.count as usize) }
    }
}

impl Drop for MonitorHandle {
    fn drop(&mut self) {
        unsafe { xrandr::XRRFreeMonitors(self.ptr.as_ptr()) };
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "serialize", derive(Serialize, Deserialize))]
pub struct Monitor {
    pub name: String,
    pub is_primary: bool,
    pub is_automatic: bool,
    pub x: i32,
    pub y: i32,
    pub width_px: i32,
    pub height_px: i32,
    pub width_mm: i32,
    pub height_mm: i32,
    /// An Output describes an actual physical monitor or display. A [`Monitor`]
    /// can have more than one output.
    pub outputs: Vec<Output>,
}
