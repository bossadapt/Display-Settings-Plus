# Display Settings Plus

**Display Settings Plus** is a GUI for [Xrandr](https://www.x.org/archive/X11R7.6/doc/man/man3/Xrandr.3.xhtml) that allows users to rotate, resize, position, and apply presets to their monitors. The changes are performed using a modified version of a [Rust Xrandr wrapper](https://github.com/dzfranklin/xrandr-rs), with abstraction provided by Tauri and React TypeScript.

![Screenshot of the application](https://github.com/user-attachments/assets/7604f9c4-b55f-486b-8de5-e38ea5121338)

## Display Settings Plus vs. Distro Display Settings

| Functionality | Display Settings Plus | Ubuntu Display Settings |
|--------------|----------------------|-----------------------|
| Undo | Modular[Beta] & Whole | Whole |
| Disable | :white_check_mark: | :white_check_mark: |
| Screenshot | :white_check_mark: | :x: |
| Position Panning | :white_check_mark: | :x: |
| Position Zooming | Manual Dynamic | Auto |
| Position Gaps Between Monitors | :white_check_mark: | :x: |
| Position Snapping | 8-point snapping (corners and edge centers align) | Hugs border |
| Monitor Mirroring (Overlapping) | All, Individual, or None | All or None |
| Rotation | :white_check_mark: | :white_check_mark: |
| Resolution | :white_check_mark: | :white_check_mark: |
| Refresh Rate | :white_check_mark: | :white_check_mark: |
| Scale | :x: | :white_check_mark: |
| Night Mode | :x: | :white_check_mark: |
| Export | JSON + Copies Xrandr scripts to clipboard | :x: |
| Presets | :white_check_mark: | :x: |
| Permanent | Requires exporting to a location where X11 runs on boot | :white_check_mark: |
| Language | English | Multi |

## Display Settings Plus vs. [ARandR](https://github.com/haad/arandr)

| Functionality | Display Settings Plus | ARandR |
|--------------|----------------------|--------|
| Undo | Modular[Beta] & Whole | :x: |
| Disable | :white_check_mark: | :white_check_mark: |
| Screenshot | :white_check_mark: | :x: |
| Position Panning | :white_check_mark: | :x: |
| Position Zooming | Manual Dynamic | 3 options (1:4, 8, 16) |
| Position Gaps Between Monitors | :white_check_mark: | :white_check_mark: |
| Position Snapping | 8-point snapping (corners and edge centers align) | Hugs border |
| Monitor Mirroring (Overlapping) | All, Individual, or None | All or None |
| Rotation | :white_check_mark: | :white_check_mark: |
| Resolution | :white_check_mark: | :white_check_mark: |
| Refresh Rate | :white_check_mark: | :x: |
| Scale | :x: | :x: |
| Night Mode | :x: | :x: |
| Export | JSON + Copies Xrandr scripts to clipboard | `.sh` Files |
| Presets | :white_check_mark: | Opens a `.sh` file |
| Permanent | Requires exporting to a location where X11 runs on boot | Same, but you can move the entire `.sh` file or extract the script from it |
| Language | English | Multi |

## How Does It Work?
In short It balances the state in the frontend with 2 states custom(state of all customization user makes without applying) and initial(state of last applied/ pulled from system)
## Future Plans
Possibly expanding usage to other display manager servers or more focused monitor settings.