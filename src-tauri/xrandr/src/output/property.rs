use std::convert::TryInto;
use std::{ptr, slice};

use x11::{xlib, xrandr};

use crate::{atom_name, real_bool, HandleSys, XHandle, XrandrError};

#[derive(Debug)]
#[cfg_attr(feature = "serialize", derive(Serialize, Deserialize))]
pub struct Property {
    pub name: String,
    pub value: Value,
    pub values: Option<Values>,
    pub is_immutable: bool,
    pub is_pending: bool,
}

impl Property {
    pub(crate) fn get(
        handle: &mut XHandle,
        output: xlib::XID,
        id: xlib::Atom,
    ) -> Result<Property, XrandrError> {
        // Based on https://gitlab.freedesktop.org/xorg/app/xrandr/-/blob/master/xrandr.c#L3867

        let name = atom_name(&mut handle.sys, id)?;

        let mut value_type = 0;
        let mut format = 0;
        let mut items_len = 0;
        let mut bytes_after = 0;
        let mut prop = ptr::null_mut();

        unsafe {
            let status = xrandr::XRRGetOutputProperty(
                handle.sys.as_ptr(),
                output,
                id,
                0,
                100,
                xlib::False,
                xlib::False,
                xlib::AnyPropertyType as xlib::Atom,
                &mut value_type,
                &mut format,
                &mut items_len,
                &mut bytes_after,
                &mut prop,
            );

            if status != 0 {
                return Err(XrandrError::GetOutputProp(output));
            }
        };

        let format = format.into();
        let value_type: ValueType = value_type.into();

        let value = Self::get_value(
            &mut handle.sys,
            &name,
            value_type,
            format,
            items_len,
            prop,
        )?;

        let info = unsafe {
            ptr::NonNull::new(xrandr::XRRQueryOutputProperty(
                handle.sys.as_ptr(),
                output,
                id,
            ))
            .ok_or(XrandrError::GetOutputProp(output))?
        };

        let is_immutable = unsafe { real_bool(info.as_ref().immutable) };
        let is_pending = unsafe { real_bool(info.as_ref().pending) };

        let values = unsafe {
            Self::get_values(&mut handle.sys, info.as_ref(), value_type, format)?
        };

        unsafe { 
            xlib::XFree(info.as_ptr().cast());
            xlib::XFree(prop.cast()) 
        };

        Ok(Self {
            name,
            value,
            values,
            is_immutable,
            is_pending,
        })
    }

    fn get_value(
        handle: &mut HandleSys,
        name: &str,
        value_type: ValueType,
        format: ValueFormat,
        len: u64,
        data: *mut u8,
    ) -> Result<Value, XrandrError> {
        if name == "EDID" {
            return Ok(Value::from_edid(data, len));
        } else if name == "GUID" {
            return Ok(Value::from_guid(data));
        }

        let value = match value_type {
            ValueType::Atom => Value::from_atom(handle, data)?,
            ValueType::Int => match format {
                ValueFormat::B8 => Value::from_i8(data, len),
                ValueFormat::B16 => Value::from_i16(data, len),
                ValueFormat::B32 => Value::from_i32(data, len),
            },
            ValueType::Card => match format {
                ValueFormat::B8 => Value::from_c8(data, len),
                ValueFormat::B16 => Value::from_c16(data, len),
                ValueFormat::B32 => Value::from_c32(data, len),
            },
            ValueType::Unrecognized(type_sys) => {
                Value::unrecognized(type_sys, format)
            }
        };

        Ok(value)
    }

    fn get_values(
        handle: &mut HandleSys,
        info: &xrandr::XRRPropertyInfo,
        value_type: ValueType,
        format: ValueFormat,
    ) -> Result<Option<Values>, XrandrError> {
        let values = if info.num_values > 0 {
            let values = unsafe {
                slice::from_raw_parts(info.values, info.num_values as usize)
            };
            let values = if real_bool(info.range) {
                match value_type {
                    ValueType::Atom => {
                        Ranges::from_atom(handle, values)?.into()
                    }

                    ValueType::Int => match format {
                        ValueFormat::B8 => Ranges::from_i8(values).into(),
                        ValueFormat::B16 => Ranges::from_i16(values).into(),
                        ValueFormat::B32 => Ranges::from_i32(values).into(),
                    },

                    ValueType::Card => match format {
                        ValueFormat::B8 => Ranges::from_c8(values).into(),
                        ValueFormat::B16 => Ranges::from_c16(values).into(),
                        ValueFormat::B32 => Ranges::from_c32(values).into(),
                    },

                    ValueType::Unrecognized(type_sys) => {
                        Values::unrecognized(type_sys, format)
                    }
                }
            } else {
                match value_type {
                    ValueType::Atom => {
                        Supported::from_atom(handle, values)?.into()
                    }

                    ValueType::Int => match format {
                        ValueFormat::B8 => Supported::from_i8(values).into(),
                        ValueFormat::B16 => Supported::from_i16(values).into(),
                        ValueFormat::B32 => Supported::from_i32(values).into(),
                    },

                    ValueType::Card => match format {
                        ValueFormat::B8 => Supported::from_c8(values).into(),
                        ValueFormat::B16 => Supported::from_c16(values).into(),
                        ValueFormat::B32 => Supported::from_c32(values).into(),
                    },

                    ValueType::Unrecognized(type_sys) => {
                        Values::unrecognized(type_sys, format)
                    }
                }
            };
            Some(values)
        } else {
            None
        };
        Ok(values)
    }
}

#[derive(Debug, Clone, Copy)]
enum ValueType {
    Atom,
    Int,
    Card,
    Unrecognized(xlib::Atom),
}

impl From<xlib::Atom> for ValueType {
    fn from(value: xlib::Atom) -> Self {
        match value {
            xlib::XA_ATOM => ValueType::Atom,
            xlib::XA_INTEGER => ValueType::Int,
            xlib::XA_CARDINAL => ValueType::Card,
            _ => ValueType::Unrecognized(value),
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum ValueFormat {
    B8,
    B16,
    B32,
}

impl From<ValueFormat> for i32 {
    fn from(value: ValueFormat) -> Self {
        match value {
            ValueFormat::B8 => 8,
            ValueFormat::B16 => 16,
            ValueFormat::B32 => 32,
        }
    }
}

impl From<i32> for ValueFormat {
    fn from(value: i32) -> Self {
        match value {
            8 => Self::B8,
            16 => Self::B16,
            32 => Self::B32,
            n => unreachable!("Cannot have value format of {} bits", n),
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "serialize", derive(Serialize, Deserialize))]
pub enum Value {
    Edid(Vec<u8>),
    Guid([u8; 16]),
    Atom(String),
    Integer8(Vec<i8>),
    Integer16(Vec<i16>),
    Integer32(Vec<i32>),
    Cardinal8(Vec<u8>),
    Cardinal16(Vec<u16>),
    Cardinal32(Vec<u32>),
    Unrecognized { value_type: xlib::Atom, format: i32 },
}

impl Value {
    fn unrecognized(value_type: xlib::Atom, format: ValueFormat) -> Self {
        Self::Unrecognized {
            value_type,
            format: format.into(),
        }
    }
    fn from_edid(data: *const u8, len: u64) -> Self {
        let edid = unsafe { slice::from_raw_parts(data, len.try_into().unwrap()) };
        Self::Edid(edid.to_vec())
    }

    fn from_guid(data: *const u8) -> Self {
        let guid = unsafe { slice::from_raw_parts(data, 16) };
        let guid: [u8; 16] = guid.try_into().unwrap();
        Self::Guid(guid)
    }

    fn from_atom(
        handle: &mut HandleSys,
        data: *const u8,
    ) -> Result<Self, XrandrError> {
        // REMOVED: this cast is undefined behaviour
        // let data = unsafe { *(data.cast::<xlib::Atom>()) };
        let data = unsafe { u64::from(*data) };
        let name = atom_name(handle, data)?;
        Ok(Value::Atom(name))
    }

    fn from_i8(data: *const u8, len: u64) -> Self {
        Self::Integer8(unsafe { Self::reinterpret_as(data, len) })
    }

    fn from_i16(data: *const u8, len: u64) -> Self {
        Self::Integer16(unsafe { Self::reinterpret_as(data, len) })
    }

    fn from_i32(data: *const u8, len: u64) -> Self {
        Self::Integer32(unsafe { Self::reinterpret_as(data, len) })
    }

    fn from_c8(data: *const u8, len: u64) -> Self {
        Self::Cardinal8(unsafe { Self::reinterpret_as(data, len) })
    }

    fn from_c16(data: *const u8, len: u64) -> Self {
        Self::Cardinal16(unsafe { Self::reinterpret_as(data, len) })
    }

    fn from_c32(data: *const u8, len: u64) -> Self {
        Self::Cardinal32(unsafe { Self::reinterpret_as(data, len) })
    }

    unsafe fn reinterpret_as<T: Copy>(data: *const u8, len: u64) -> Vec<T> {
        slice::from_raw_parts(data.cast::<T>(), len.try_into().unwrap()).to_vec()
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "serialize", derive(Serialize, Deserialize))]
pub enum Values {
    Range(Ranges),
    Supported(Supported),
    Unrecognized { value_type: xlib::Atom, format: i32 },
}

impl Values {
    fn unrecognized(value_type: xlib::Atom, format: ValueFormat) -> Self {
        Self::Unrecognized {
            value_type,
            format: format.into(),
        }
    }
}

impl From<Ranges> for Values {
    fn from(value: Ranges) -> Self {
        Self::Range(value)
    }
}

impl From<Supported> for Values {
    fn from(value: Supported) -> Self {
        Self::Supported(value)
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "serialize", derive(Serialize, Deserialize))]
pub enum Ranges {
    Atom(Vec<Range<String>>),
    Integer8(Vec<Range<i8>>),
    Integer16(Vec<Range<i16>>),
    Integer32(Vec<Range<i32>>),
    Cardinal8(Vec<Range<u8>>),
    Cardinal16(Vec<Range<u16>>),
    Cardinal32(Vec<Range<u32>>),
}

#[derive(Debug)]
#[cfg_attr(feature = "serialize", derive(Serialize, Deserialize))]
pub struct Range<T> {
    pub lower: T,
    pub upper: T,
}

impl Ranges {
    fn from_atom(
        handle: &mut HandleSys,
        values: &[i64],
    ) -> Result<Self, XrandrError> {
        let values = values
            .chunks_exact(2)
            .map(|values| {
                let lower = values[0];
                let upper = values[1];

                let lower =
                    unsafe { *(lower as *const i64).cast::<xlib::Atom>() };
                let upper =
                    unsafe { *(upper as *const i64).cast::<xlib::Atom>() };

                let lower = atom_name(handle, lower)?;
                let upper = atom_name(handle, upper)?;

                Ok(Range { lower, upper })
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self::Atom(values))
    }

    fn from_i8(values: &[i64]) -> Self {
        Self::Integer8(unsafe { Self::reinterpret_as(values) })
    }

    fn from_i16(values: &[i64]) -> Self {
        Self::Integer16(unsafe { Self::reinterpret_as(values) })
    }

    fn from_i32(values: &[i64]) -> Self {
        Self::Integer32(unsafe { Self::reinterpret_as(values) })
    }

    fn from_c8(values: &[i64]) -> Self {
        Self::Cardinal8(unsafe { Self::reinterpret_as(values) })
    }

    fn from_c16(values: &[i64]) -> Self {
        Self::Cardinal16(unsafe { Self::reinterpret_as(values) })
    }

    fn from_c32(values: &[i64]) -> Self {
        Self::Cardinal32(unsafe { Self::reinterpret_as(values) })
    }

    unsafe fn reinterpret_as<T: Copy>(values: &[i64]) -> Vec<Range<T>> {
        values
            .chunks_exact(2)
            .map(|values| {
                let lower = &values[0];
                let upper = &values[1];

                let lower = *(lower as *const i64).cast::<T>();
                let upper = *(upper as *const i64).cast::<T>();
                Range { lower, upper }
            })
            .collect()
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "serialize", derive(Serialize, Deserialize))]
pub enum Supported {
    Atom(Vec<String>),
    Integer8(Vec<i8>),
    Integer16(Vec<i16>),
    Integer32(Vec<i32>),
    Cardinal8(Vec<u8>),
    Cardinal16(Vec<u16>),
    Cardinal32(Vec<u32>),
}

impl Supported {
    fn from_atom(
        handle: &mut HandleSys,
        values: &[i64],
    ) -> Result<Self, XrandrError> {
        let values = values
            .iter()
            .map(|val| {
                let val = 
                    unsafe { *((val as *const i64).cast::<xlib::Atom>()) };
                let val = atom_name(handle, val)?;
                Ok(val)
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self::Atom(values))
    }

    fn from_i8(values: &[i64]) -> Self {
        Self::Integer8(unsafe { Self::reinterpret_as(values) })
    }

    fn from_i16(values: &[i64]) -> Self {
        Self::Integer16(unsafe { Self::reinterpret_as(values) })
    }

    fn from_i32(values: &[i64]) -> Self {
        Self::Integer32(unsafe { Self::reinterpret_as(values) })
    }

    fn from_c8(values: &[i64]) -> Self {
        Self::Cardinal8(unsafe { Self::reinterpret_as(values) })
    }

    fn from_c16(values: &[i64]) -> Self {
        Self::Cardinal16(unsafe { Self::reinterpret_as(values) })
    }

    fn from_c32(values: &[i64]) -> Self {
        Self::Cardinal32(unsafe { Self::reinterpret_as(values) })
    }

    // .map(|val| *(val as *const _ as *const T))
    // |: try `pointer::cast`, a safer alternative: `(val as *const _).cast::<T>()`
    unsafe fn reinterpret_as<T: Copy>(values: &[i64]) -> Vec<T> {
        values
            .iter()
            .map(|val| *(val as *const i64).cast::<T>())
            .collect()
    }
}
