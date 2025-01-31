use x11::xlib;
use crate::XHandle;
use crate::crtc::Crtc;

// The amount of milimeters in an inch, needed for dpi calculation
const INCH_MM: f32 = 25.4;

#[derive(Debug)]
pub struct ScreenSize {
    pub(crate) width: i32,
    pub(crate) width_mm: i32,
    pub(crate) height: i32,
    pub(crate) height_mm: i32,
}

// Apparently this does not exist (in non-nightly)?
// This function checks the requirements for a safe cast (right?), 
// so we allow possible trunction here and only here
#[allow(clippy::cast_possible_truncation)]
fn lossy_f32_to_i32(from: f32) -> Result<i32, ()> {
    if from.round() >= i32::MIN as f32 && from.round() <= i32::MAX as f32  {
        Ok(from.round() as i32)
    }
    else { Err(()) }
}

impl ScreenSize {
    /// True iff the given crtc fits on a screen of this size
    #[must_use] pub fn fits_crtc(&self, crtc: &Crtc) -> bool {
        let (max_x, max_y) = crtc.max_coordinates();
        max_x <= self.width && max_y <= self.height
    }

    /// Calculates the screen size that (snugly) fits a set of crtcs
    pub(crate) fn fitting_crtcs(
        handle: &mut XHandle, crtcs: &[Crtc]) 
    -> Self 
    {
        // see also: following unwraps
        assert!(!crtcs.is_empty(), "Empty input vector");

        let width = crtcs.iter()
            .map(|p| p.max_coordinates().0)
            .max()
            .unwrap();
        let height = crtcs.iter()
            .map(|p| p.max_coordinates().1)
            .max()
            .unwrap();

        // Get the old sizes to calculate the dpi
        let c_h = unsafe { xlib::XDisplayHeight(handle.sys.as_ptr(), 0) };
        let c_h_mm = unsafe { xlib::XDisplayHeightMM(handle.sys.as_ptr(), 0) };
        
        // Calculate the new physical size with the dpi and px count
        let dpi: f32 = (INCH_MM * c_h as f32) / c_h_mm as f32;

        // let x = (INCH_MM * width as f32) / dpi
        let width_mm = lossy_f32_to_i32((INCH_MM * width as f32) / dpi).unwrap();
		let height_mm = lossy_f32_to_i32((INCH_MM * height as f32) / dpi).unwrap();

        ScreenSize{ width, width_mm, height, height_mm }
    }
}

