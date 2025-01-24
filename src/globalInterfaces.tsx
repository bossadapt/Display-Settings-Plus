
export interface point {
    x: number;
    y: number;
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
    widthMm: number;
    heightMm: number;
    outputs: FrontendOutput[];
}

export interface FrontendOutput {
    xid: number;
    timestamp: number;
    isPrimary: boolean;
    crtc?: number;
    name: string;
    mmWidth: number;
    mmHeight: number;
    connected: boolean;
    subpixelOrder: number;
    crtcs: number[];
    clones: number[];
    modes: number[];
    preferredModes: number[];
    currentMode?: number;
}
