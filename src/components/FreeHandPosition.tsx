import { Application, Container, ContainerChild, FederatedPointerEvent, Graphics, ICanvas, Renderer, BitmapText } from 'pixi.js';
import { useState, useRef, Dispatch, SetStateAction, MutableRefObject, useEffect } from 'react';
import { FrontendMonitor, point, Rotation } from '../globalValues';

interface FreeHandPositionProps {
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    customMonitors: FrontendMonitor[];
    setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
    rerenderMonitorsContainerRef: MutableRefObject<Function | null>;
    normalizePositionsRef: MutableRefObject<((customMonitors: FrontendMonitor[]) => void) | null>;
}
export const FreeHandPosition: React.FC<FreeHandPositionProps> = ({ initialMonitors, customMonitors, setMonitors: setCustMonitors, rerenderMonitorsContainerRef, normalizePositionsRef }) => {
    // within 10 px of another mon will cause a snap
    const snapPixelLength = 50;
    const dragTarget = useRef<null | Container<ContainerChild>>(null)
    const screenDragActive = useRef(false);
    const screenDragOffsetTotal = useRef<point>({ x: 0, y: 0 });
    const monitorScale = 10;
    const initialDragX = useRef(0);
    const initialDragY = useRef(0);
    const previousDragOffsetX = useRef(0);
    const previousDragOffsetY = useRef(0);
    const app = useRef<Application | null>(null);
    //needs to be use state to update button color
    const [snapEnabled, setSnapEnabled] = useState(true);
    const snapEnabledRef = useRef(true);
    const didInit = useRef(false);
    async function init(canvasRef: ICanvas) {
        let appLocal = new Application();
        await appLocal.init({ background: '#1a171f', canvas: canvasRef });
        //createGrid(appLocal);
        for (let i = 0; i < customMonitors.length; i++) {
            appLocal.stage.addChild(createMonitorContainer(customMonitors[i]));
        }

        appLocal.resizeTo = window;
        appLocal.stage.eventMode = 'static';
        appLocal.stage.hitArea = appLocal.screen;
        appLocal.stage.on('rightdown', onScreenDragStart);
        appLocal.stage.on('rightup', onScreenDragEnd);
        appLocal.stage.on('rightupoutside', onScreenDragEnd);
        appLocal.stage.on('pointerup', onDragEnd);
        appLocal.stage.on('pointerupoutside', onDragEnd);
        //TODO: maybe make it scalable by turning monitorScale into a useRef
        //https://pixijs.download/dev/docs/events.FederatedWheelEvent.html
        //appLocal.stage.on('wheel')
        app.current = appLocal;

    }

    //TODO: maybe add the grid and fix the frequency of lines and make the move 
    // function createGrid(appLocal: Application<Renderer>) {
    //     let grid = new Graphics();
    //     //based off of https://pixijs.com/8.x/examples/graphics/pixel-line
    //     // Draw 10 vertical lines spaced 10 pixels apart
    //     // Draw 10 vertical lines spaced 10 pixels apart
    //     for (let i = 0; i < appLocal.stage.width / 100; i++) {
    //         // Move to top of each line (x = i*10, y = 0)
    //         grid
    //             .moveTo(i * 10, 0)
    //             // Draw down to bottom (x = i*10, y = 100)
    //             .lineTo(i * 10, 100);
    //     }

    //     // Draw 10 horizontal lines spaced 10 pixels apart
    //     for (let i = 0; i < appLocal.stage.height / 100; i++) {
    //         // Move to start0, 100);
    //     }

    //     // Draw 10 horizontal lines spaced 10 pixels apart
    //     for (let i = 0; i < appLocal.stage.height / 100; i++) {
    //         // Move to start of each line (x = 0, y = i*10)
    //         grid
    //             .moveTo(0, i * 10)
    //             // Draw across to end (x = 100, y = i*10)
    //             .lineTo(300, i * 10);
    //     }
    //     console.log("height: ", appLocal.stage.height);
    //     console.log("width: ", appLocal.stage.width);
    //     grid.stroke({ color: '#ffffff', pixelLine: false, width: 1 });
    //     appLocal.stage.addChild(grid);

    // }
    function updateGlobalPosition(monitorName: string, x: number, y: number) {
        setCustMonitors((mons) =>
            mons.map((curMon) =>
                curMon.name === monitorName
                    ? { ...curMon, y: Math.trunc(Math.ceil(y)), x: Math.trunc(Math.ceil(x)) }
                    : curMon
            )
        );
    }
    function rerenderMonitors(newMonitors: FrontendMonitor[]) {
        if (app.current) {
            console.log("rerender called");
            //deletion
            app.current!.stage.children = [];
            //rebuilding
            console.log("children:", app.current!.stage.children);
            for (let i = 0; i < newMonitors.length; i++) {
                app.current!.stage.addChild(createMonitorContainer(newMonitors[i]));
            }
        } else {
            console.log("app not built yet, unable to rerender");
        }
    }
    function createMonitorContainer(monitor: FrontendMonitor): Container {
        // Container
        const monitorContainer = new Container();
        monitorContainer.isRenderGroup = true;
        monitorContainer.x = monitor.x / monitorScale + screenDragOffsetTotal.current.x;
        monitorContainer.y = monitor.y / monitorScale + screenDragOffsetTotal.current.y;
        monitorContainer.label = monitor.name;
        monitorContainer.cursor = 'pointer';
        const monitorGraphic = new Graphics();
        const monitorText = new BitmapText();
        // handles if the monitor is disabled(should not be seen and interactive)
        if (monitor.outputs[0].currentMode!.xid === 0) {
            console.log("DISABLED ON FREEHANDTSX")
            console.log(monitor);
            monitorContainer.eventMode = 'none';
            monitorContainer.alpha = 0;
        } else {
            monitorContainer.eventMode = 'static';
        }
        //square
        let monitorWidth = monitor.outputs[0].currentMode!.width;
        let monitorHeight = monitor.outputs[0].currentMode!.height;
        //handle monitors being sideways
        if (monitor.outputs[0].rotation === Rotation.Left || monitor.outputs[0].rotation === Rotation.Right) {
            monitorWidth = monitor.outputs[0].currentMode!.height;
            monitorHeight = monitor.outputs[0].currentMode!.width;
        }
        console.log("Width:,", monitorWidth, "Height:", monitorHeight);

        monitorGraphic.rect(0, 0, monitorWidth / monitorScale, monitorHeight / monitorScale);
        monitorGraphic.fillStyle = 'black';
        monitorGraphic.fill();
        monitorGraphic.stroke({ width: 2, color: 'pink' });
        //text
        monitorText.text = monitor.name;
        monitorText.tint = 'hotpink';
        switch (monitor.outputs[0].rotation) {
            case Rotation.Inverted:
                //Inverting
                monitorText.x = (monitorWidth / monitorScale);
                monitorText.y = (monitorHeight / monitorScale);
                monitorText.scale = -1;
                break;
            case Rotation.Right:
                //Righting
                monitorText.x = (monitorWidth / monitorScale);
                monitorText.rotation = Math.PI / 2
                break;
            case Rotation.Left:
                //Lefting
                monitorText.y = monitorHeight / monitorScale;
                monitorText.scale = -1;
                monitorText.rotation = Math.PI / 2
                break;
            default:

        }
        // Setup events for mouse + touch using the pointer events
        monitorContainer.on('mousedown', onDragStart, monitorGraphic);
        monitorContainer.addChild(monitorGraphic, monitorText);
        monitorContainer.width = monitorWidth / monitorScale;
        monitorContainer.height = monitorHeight / monitorScale;
        return monitorContainer;
    }
    function onScreenDragStart(eve: FederatedPointerEvent) {
        screenDragActive.current = true;
        previousDragOffsetX.current = eve.globalX;
        previousDragOffsetY.current = eve.globalY;
        app.current!.stage.on('pointermove', onScreenMove);
    }
    function onScreenMove(eve: FederatedPointerEvent) {
        console.log("screen drag")
        if (screenDragActive.current) {
            let difX = eve.globalX - previousDragOffsetX.current;
            let difY = eve.globalY - previousDragOffsetY.current;
            previousDragOffsetX.current = eve.globalX;
            previousDragOffsetY.current = eve.globalY;
            screenDragOffsetTotal.current.x += difX;
            screenDragOffsetTotal.current.y += difY;
            app.current!.stage.children.forEach((child) => {
                child.x += difX;
                child.y += difY;
            });
        }
    }
    function onScreenDragEnd() {
        if (screenDragActive.current) {
            app.current!.stage.off('pointermove', onScreenMove);
            screenDragActive.current = false;
        }
    }
    function onDragMove(eve: FederatedPointerEvent) {
        let difX = eve.globalX - previousDragOffsetX.current;
        let difY = eve.globalY - previousDragOffsetY.current;
        previousDragOffsetX.current = eve.globalX;
        previousDragOffsetY.current = eve.globalY;
        if (dragTarget.current) {
            dragTarget.current.x += difX;
            dragTarget.current.y += difY;
        }
    }
    function onDragStart(eve: FederatedPointerEvent) {
        // Store a reference to the data
        // * The reason for this is because of multitouch *
        // * We want to track the movement of this particular touch *
        eve.target.alpha = 0.5;
        dragTarget.current = eve.target;

        initialDragX.current = eve.target.x;
        initialDragY.current = eve.target.x;

        previousDragOffsetX.current = eve.globalX;
        previousDragOffsetY.current = eve.globalY;

        app.current!.stage.on('pointermove', onDragMove);
    }
    function overLapEachOther(x1: number, y1: number, width1: number, height1: number,
        x2: number, y2: number, width2: number, height2: number
    ): boolean {
        // Calculate the edges of the first square
        const left1 = x1;
        const right1 = x1 + width1;
        const top1 = y1;
        const bottom1 = y1 + height1;

        // Calculate the edges of the second square
        const left2 = x2;
        const right2 = x2 + width2;
        const top2 = y2;
        const bottom2 = y2 + height2;

        // Check if the squares overlap
        if (left1 < right2 &&
            right1 > left2 &&
            top1 < bottom2 &&
            bottom1 > top2) {
            return true;
        }

        return false;
    }
    function onDragEnd() {
        if (dragTarget.current) {
            if (snapEnabledRef.current) {
                console.log("snap enabled: ", snapEnabledRef.current);
                //check if its within hit boxes located outside right outside of each monitor
                let monitorsHitboxInsideOf = app.current!.stage.children.filter(
                    (mon) => {
                        if (mon === dragTarget.current || mon.alpha === 0) {
                            return false;
                        } else {
                            let hitbox = {
                                xStart: mon.x - snapPixelLength - dragTarget.current!.width, xEnd: mon.x + mon.width + snapPixelLength,
                                yStart: mon.y - snapPixelLength - dragTarget.current!.height, yEnd: mon.y + mon.height + snapPixelLength

                            };
                            if (dragTarget.current!.y > hitbox.yStart && dragTarget.current!.y < hitbox.yEnd &&
                                dragTarget.current!.x > hitbox.xStart && dragTarget.current!.x < hitbox.xEnd
                            ) {
                                return true;
                            }
                            return false;
                        }
                    }
                );
                if (monitorsHitboxInsideOf.length != 0) {
                    //choose the closer one
                    let monitorSnapTarget = monitorsHitboxInsideOf[0];
                    let lowestDistance = Math.abs(monitorsHitboxInsideOf[0].x - dragTarget.current.x) + Math.abs(monitorsHitboxInsideOf[0].y - dragTarget.current.y);
                    for (let i = 1; i < monitorsHitboxInsideOf.length; i++) {
                        let curDistance = Math.abs(monitorsHitboxInsideOf[i].x - dragTarget.current.x) + Math.abs(monitorsHitboxInsideOf[i].y - dragTarget.current.y);
                        if (curDistance < lowestDistance) {
                            lowestDistance = curDistance;
                            monitorSnapTarget = monitorsHitboxInsideOf[i];
                        }
                    }
                    //invalidate snaps that overrun other monitors + figure out which side to snap to and do it
                    let difX = dragTarget.current.x - monitorSnapTarget.x;
                    let difY = dragTarget.current.y - monitorSnapTarget.y;
                    let validTop = app.current!.stage.children.find((child) =>

                        child != dragTarget.current && child.alpha !== 0 && overLapEachOther(child.x, child.y, child.width, child.height,
                            monitorSnapTarget.x, monitorSnapTarget.y - monitorSnapTarget.height, monitorSnapTarget.width, monitorSnapTarget.height)
                    ) == undefined;
                    let validRight = app.current!.stage.children.find((child) =>
                        child !== dragTarget.current && child.alpha !== 0 && overLapEachOther(child.x, child.y, child.width, child.height,
                            monitorSnapTarget.x + monitorSnapTarget.width, monitorSnapTarget.y, monitorSnapTarget.width, monitorSnapTarget.height)
                    ) == undefined;
                    let validLeft = app.current!.stage.children.find((child) =>
                        child !== dragTarget.current && child.alpha !== 0 && overLapEachOther(child.x, child.y, child.width, child.height,
                            monitorSnapTarget.x - monitorSnapTarget.width, monitorSnapTarget.y, monitorSnapTarget.width, monitorSnapTarget.height)
                    ) == undefined;
                    let validBottom = app.current!.stage.children.find((child) =>
                        child !== dragTarget.current && child.alpha !== 0 && overLapEachOther(child.x, child.y, child.width, child.height,
                            monitorSnapTarget.x, monitorSnapTarget.y + monitorSnapTarget.height, monitorSnapTarget.width, monitorSnapTarget.height)
                    ) == undefined;
                    //console.log("TValid" + validTop + ",BValid:" + validBottom + ",RValid:" + validRight + ",LValid" + validLeft);
                    if (!validTop && !validBottom && !validRight && !validLeft) {
                        //user trying to play games with me, send em back to start
                        console.log("failed to find space for snap, returing to original position");
                        dragTarget.current.x = initialDragX.current;
                        dragTarget.current.y = initialDragY.current;
                        return;
                    }
                    //snapping it
                    //TODO: allow snapping of bottom anchors ontop of the top right to rop left, also add snapping for same as
                    if (Math.abs(difX) > Math.abs(difY) || (!validTop && !validBottom)) {
                        if ((difX < 0 && validLeft) || !validRight) {
                            //left
                            dragTarget.current.x = monitorSnapTarget.x - dragTarget.current.width;
                            dragTarget.current.y = monitorSnapTarget.y;
                        } else {
                            //right
                            dragTarget.current.x = monitorSnapTarget.x + monitorSnapTarget.width;
                            dragTarget.current.y = monitorSnapTarget.y;
                        }
                    } else {
                        if ((difY < 0 && validTop) || !validBottom) {
                            //up
                            dragTarget.current.x = monitorSnapTarget.x;
                            dragTarget.current.y = monitorSnapTarget.y - dragTarget.current.height;
                        } else {
                            //down
                            dragTarget.current.x = monitorSnapTarget.x;
                            dragTarget.current.y = monitorSnapTarget.y + monitorSnapTarget.height;
                        }
                    }
                }
            }
            updateGlobalPosition(dragTarget.current.label, (dragTarget.current.x - screenDragOffsetTotal.current.x) * monitorScale, (dragTarget.current.y - screenDragOffsetTotal.current.y) * monitorScale);
            app.current!.stage.off('pointermove', onDragMove);
            dragTarget.current.alpha = 1;
            dragTarget.current = null;
        }
        //check if its in snapping hitbox  and snapping enabled
    }
    function resetCameraPosition() {
        if (app.current) {
            app.current!.stage.children.forEach((mon => {
                mon.x -= screenDragOffsetTotal.current.x;
                mon.y -= screenDragOffsetTotal.current.y;
            }));
        }
        screenDragOffsetTotal.current.x = 0;
        screenDragOffsetTotal.current.y = 0;
    }
    function resetMonitorsPositions() {
        if (app.current) {
            app.current!.stage.children.forEach(((mon, idx) => {
                mon.x = initialMonitors.current[idx].x / monitorScale;
                mon.y = initialMonitors.current[idx].y / monitorScale;
            }));
        }
        setCustMonitors((mons) => mons.map((curMon, idx) => ({ ...curMon, x: initialMonitors.current[idx].x, y: initialMonitors.current[idx].y })));
        screenDragOffsetTotal.current.x = 0;
        screenDragOffsetTotal.current.y = 0;
    }
    function toggleSnap() {
        //for rerendero for button
        setSnapEnabled((prev) => {
            return (!prev);
        });
        //for the listener's ref to understand not to snap anymore
        snapEnabledRef.current = !snapEnabledRef.current;
    };
    ///Used to make it so the farthest left monitor starts at zero x and and lowest monitor to start at zero(adjusting all other monitors accordingly)
    function normalizePositions(customMonitors: FrontendMonitor[]) {
        if (app.current) {
            //console.log("initial XX:", initialMonitors.current[focusedMonitorIdx].x, "| YY:", initialMonitors.current[focusedMonitorIdx].y);
            let minOffsetY = Number.MAX_VALUE;
            let minOffsetX = Number.MAX_VALUE;
            //find the smallest offsets
            app.current.stage.children.forEach((mon) => {
                if (mon.x < minOffsetX) {
                    minOffsetX = mon.x;
                }
                if (mon.y < minOffsetY) {
                    minOffsetY = mon.y;
                }
            })
            if (minOffsetX == Number.MAX_VALUE) {
                //there are no monitors
                return;
            }
            //revert the offset to normalize
            let newMonitors = [...customMonitors];
            app.current.stage.children.forEach((mon, idx) => {
                mon.x -= minOffsetX;
                mon.y -= minOffsetY;
                newMonitors[idx].x = mon.x * monitorScale;
                newMonitors[idx].y = mon.y * monitorScale;
            });
            setCustMonitors(newMonitors);
            screenDragOffsetTotal.current.x = 0;
            screenDragOffsetTotal.current.y = 0;
            //console.log("initial XX:", initialMonitors.current[focusedMonitorIdx].x, "| YY:", initialMonitors.current[focusedMonitorIdx].y);
        }
    }

    useEffect(() => {
        rerenderMonitorsContainerRef.current = rerenderMonitors;
        normalizePositionsRef.current = normalizePositions;
    }, [rerenderMonitors, normalizePositions])

    return (
        <div style={{ display: 'flex', flexDirection: "row" }}>
            <p style={{ width: "20vw", height: "50vh" }}><b>Controls:</b> <br /><br />
                <b>Move Monitors:</b> Hold Left Click <br /><br />
                <b>Pan:</b> Hold Right Click</p>
            <canvas style={{ marginLeft: "auto", marginRight: "auto", display: 'block', width: "60vw", height: "60vh" }} ref={canvas => {
                if (didInit.current) {
                    return;
                }
                init(canvas as any);
                didInit.current = true;

            }}
                onContextMenu={(e) => { e.preventDefault(); }}
            ></canvas>
            <div style={{ width: "20vw", height: "60vh" }}>
                <p style={{ width: "20vw", height: "10vh" }}> <b>Additional Functions:</b></p>
                <button style={{ width: "20vw", height: "10vh" }} onClick={resetMonitorsPositions}>Reset Monitor Positions</button>
                <button style={{ width: "20vw", height: "10vh" }} onClick={resetCameraPosition}>Reset Camera Position</button>
                <button style={{ width: "20vw", height: "10vh" }} onClick={() => normalizePositions(customMonitors)}>Normalize Positions</button>
                <button style={{ width: "20vw", height: "10vh", color: snapEnabled ? 'hotpink' : '#3B3B3B' }} onClick={toggleSnap}>Toggle Snap</button>
            </div>
        </div >
    );
}
export default FreeHandPosition;
