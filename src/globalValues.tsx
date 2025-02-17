import { defaultTheme, Theme } from "react-select";

export const customSelectTheme: Theme = {
    ...defaultTheme,
    borderRadius: 0,
    colors: {
        ...defaultTheme.colors,
        neutral0: 'black',
        neutral70: 'black',
        neutral80: 'white',
        //primary == background
        //hover over
        primary25: 'hotpink',
        primary50: 'pink',
        primary75: 'black',
        //already selected background from dropdown
        primary: 'hotpink',

    }
}

export interface point {
    x: number;
    y: number;
}
export enum Rotation {
    Normal = "Normal",
    Left = "Left",
    Inverted = "Inverted",
    Right = "Right",
}
export interface Mode {
    xid: number,
    width: number,
    height: number,
    dot_clock: number,
    hsync_tart: number,
    hsync_end: number,
    htotal: number,
    hskew: number,
    vsync_start: number,
    vsync_end: number,
    vtotal: number,
    name: String,
    flags: number,
    rate: number,
}
//These are more surface leveled versions of the xrandr versions
export interface FrontendMonitor {
    name: string;
    isPrimary: boolean;
    isAutomatic: boolean;
    x: number;
    y: number;
    widthPx: number;
    heightPx: number;
    outputs: FrontendOutput[];
}

export interface FrontendOutput {
    xid: number;
    timestamp: number;
    isPrimary: boolean;
    crtc?: number;
    rotation: Rotation;
    name: string;
    connected: boolean;
    subpixelOrder: number;
    crtcs: number[];
    clones: number[];
    modes: Mode[];
    preferredModes: Mode[];
    currentMode?: Mode;
}
