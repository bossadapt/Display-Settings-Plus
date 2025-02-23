pub mod property;

use crate::screen_resources::ScreenResourcesHandle;
use crate::{Crtc, Mode, ScreenResources, XHandle, XrandrError};
use indexmap::IndexMap;
use property::{Property, Value};
use std::os::raw::c_int;
use std::{ptr, slice};
use x11::{xlib, xrandr};

use crate::XId;
use crate::XTime;
use crate::CURRENT_TIME;

#[derive(Debug)]
#[cfg_attr(feature = "serialize", derive(Serialize, Deserialize))]
pub struct Output {
    pub xid: XId,
    pub properties: IndexMap<String, Property>,
    pub timestamp: XTime,
    pub is_primary: bool,
    pub crtc: Option<XId>,
    pub name: String,
    pub mm_width: u64,
    pub mm_height: u64,
    pub connected: bool,
    pub subpixel_order: u16,
    pub crtcs: Vec<XId>,
    pub clones: Vec<XId>,
    pub modes: Vec<XId>,
    pub preferred_modes: Vec<XId>,
    pub current_mode: Option<XId>,
}

// A wrapper that drops the pointer if it goes out of scope.
// Avoid having to deal with the various early returns
struct OutputHandle {
    ptr: ptr::NonNull<xrandr::XRROutputInfo>,
}

impl OutputHandle {
    fn new(handle: &mut XHandle, xid: XId) -> Result<Self, XrandrError> {
        let res = ScreenResourcesHandle::new(handle)?;

        let raw_ptr = unsafe { xrandr::XRRGetOutputInfo(handle.sys.as_ptr(), res.ptr(), xid) };

        let ptr = ptr::NonNull::new(raw_ptr).ok_or(XrandrError::GetOutputInfo(xid))?;

        Ok(Self { ptr })
    }
}

impl Drop for OutputHandle {
    fn drop(&mut self) {
        unsafe { xrandr::XRRFreeOutputInfo(self.ptr.as_ptr()) };
    }
}

impl Output {
    /// Get the Output's EDID property, if it exists.
    ///
    /// EDID stands for Extended Device Identification Data. You can parse it
    /// with a crate such as [edid][edid-crate] to get information such as the
    /// device model or colorspace.
    ///
    /// [edid-crate]: https://crates.io/crates/edid
    #[must_use]
    pub fn edid(&self) -> Option<Vec<u8>> {
        self.properties.get("EDID").map(|prop| match &prop.value {
            Value::Edid(edid) => edid.clone(),
            _ => unreachable!("Property with name EDID should have type edid"),
        })
    }

    pub(crate) fn from_xid(
        handle: &mut XHandle,
        xid: u64,
        crtcs_vec: Option<&Vec<Crtc>>,
        res: &ScreenResources,
    ) -> Result<Self, XrandrError> {
        let output_info = OutputHandle::new(handle, xid)?;
        let crtcs_vec = match crtcs_vec {
            Some(crtcs) => crtcs.clone(),
            None => {
                let mut output: Vec<Crtc> = Vec::new();
                if let Ok(crtc_found) = res.crtc(handle, xid) {
                    output.push(crtc_found);
                }
                output
            }
        };
        let xrandr::XRROutputInfo {
            crtc,
            ncrtc,
            crtcs,
            nmode,
            npreferred,
            modes,
            name,
            nameLen,
            connection,
            mm_width,
            mm_height,
            subpixel_order,
            ..
        } = unsafe { output_info.ptr.as_ref() };
        let connected = c_int::from(*connection) == xrandr::RR_Connected;
        // Name processing
        let name_b = unsafe { slice::from_raw_parts(*name as *const u8, *nameLen as usize) };

        let name = String::from_utf8_lossy(name_b).to_string();
        // let properties = Self::get_props(handle, xid)?;
        //There is no reason to pull information about monitors that are not connected
        if connected {
            let is_primary =
                xid == unsafe { xrandr::XRRGetOutputPrimary(handle.sys.as_ptr(), handle.root()) };

            // let clones = unsafe {
            //     slice::from_raw_parts(*clones, *nclone as usize) };

            let modes = unsafe { slice::from_raw_parts(*modes, *nmode as usize) };

            let preferred_modes = modes[0..*npreferred as usize].to_vec();

            let crtcs = unsafe { slice::from_raw_parts(*crtcs, *ncrtc as usize) };

            let crtc_id = if *crtc == 0 { None } else { Some(*crtc) };

            let curr_crtc = match crtc_id {
                Some(crtc_id) => Some(
                    crtcs_vec
                        .iter()
                        .find(|crtc| crtc.xid == crtc_id)
                        .unwrap()
                        .clone(),
                ),
                _ => None,
            };

            let current_mode = curr_crtc
                .and_then(|crtc_info| modes.iter().copied().find(|&m| m == crtc_info.mode));

            let result = Self {
                xid,
                properties: Default::default(),
                timestamp: CURRENT_TIME,
                is_primary,
                crtc: crtc_id,
                name,
                mm_width: *mm_width,
                mm_height: *mm_height,
                connected,
                subpixel_order: *subpixel_order,
                crtcs: crtcs.to_vec(),
                clones: Default::default(),
                modes: modes.to_vec(),
                preferred_modes,
                current_mode,
            };

            Ok(result)
        } else {
            let result = Self {
                xid,
                properties: Default::default(),
                timestamp: CURRENT_TIME,
                is_primary: false,
                crtc: Default::default(),
                name,
                mm_width: *mm_width,
                mm_height: *mm_height,
                connected,
                subpixel_order: Default::default(),
                crtcs: Default::default(),
                clones: Default::default(),
                modes: Default::default(),
                preferred_modes: Default::default(),
                current_mode: None,
            };

            Ok(result)
        }
    }

    fn get_props(
        handle: &mut XHandle,
        xid: xlib::XID,
    ) -> Result<IndexMap<String, Property>, XrandrError> {
        let mut props_len = 0;
        let props_data =
            unsafe { xrandr::XRRListOutputProperties(handle.sys.as_ptr(), xid, &mut props_len) };

        let props_slice = unsafe { slice::from_raw_parts(props_data, props_len as usize) };

        let props = props_slice
            .iter()
            .map(|prop_id| {
                let prop = Property::get(handle, xid, *prop_id)?;
                Ok((prop.name.clone(), prop))
            })
            .collect();

        unsafe { xlib::XFree(props_data.cast()) };

        props
    }

    pub(crate) unsafe fn from_list(
        handle: &mut XHandle,
        data: *mut xrandr::RROutput,
        len: c_int,
        res: &ScreenResources,
    ) -> Result<Vec<Output>, XrandrError> {
        slice::from_raw_parts(data, len as usize)
            .iter()
            .map(|xid| Output::from_xid(handle, *xid, None, res))
            .collect()
    }
}

// #[cfg(test)]
// mod tests {
//     use crate::XHandle;

//     #[test]
//     fn can_get_output_edid() {
//         let outputs = XHandle::open().unwrap().all_outputs().unwrap();
//         let output = outputs.first().unwrap();
//         let edid = output.edid().unwrap();
//         println!("{:?}", edid);
//     }
// }
