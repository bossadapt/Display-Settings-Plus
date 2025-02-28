import { Application, Container, ContainerChild, FederatedPointerEvent, Graphics, ICanvas, BitmapText, Sprite, Assets } from 'pixi.js';

import { useState, useRef, Dispatch, SetStateAction, MutableRefObject, useEffect } from 'react';
import { FrontendMonitor, point, point as Point, Rotation } from '../globalValues';
import { convertFileSrc } from '@tauri-apps/api/core';


interface FreeHandPositionProps {
    initialMonitors: MutableRefObject<FrontendMonitor[]>;
    customMonitors: FrontendMonitor[];
    setMonitors: Dispatch<SetStateAction<FrontendMonitor[]>>;
    rerenderMonitorsContainerRef: MutableRefObject<Function | null>;
    normalizePositionsRef: MutableRefObject<((customMonitors: FrontendMonitor[]) => FrontendMonitor[]) | null>;
    monitorScale: number;
    setMonitorScale: Dispatch<SetStateAction<number>>;
}
export const FreeHandPosition: React.FC<FreeHandPositionProps> = ({ initialMonitors, customMonitors, setMonitors: setCustMonitors, rerenderMonitorsContainerRef, normalizePositionsRef, monitorScale, setMonitorScale }) => {
    const dragTarget = useRef<null | Container<ContainerChild>>(null)
    const screenDragActive = useRef(false);
    const screenDragOffsetTotal = useRef<Point>({ x: 0, y: 0 });
    const customMonitorsRef = useRef<FrontendMonitor[]>([...customMonitors]);
    const monitorScaleRef = useRef<number>(10);
    const initialDragX = useRef(0);
    const initialDragY = useRef(0);
    const previousMonitorOffset = useRef<Point>({ x: 0, y: 0 });
    const previousScreenOffset = useRef<Point>({ x: 0, y: 0 });
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
            appLocal.stage.addChild(await createMonitorContainer(customMonitors[i]));
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
        //appLocal.stage.on("wheelcapture", onWheelChange)
        //appLocal.stage.on('wheel')
        app.current = appLocal;

    }
    function updateGlobalPosition(monitorName: string, x: number, y: number) {
        console.log("setting x:", x, "y:", y);
        customMonitorsRef.current = customMonitorsRef.current.map((curMon) =>
            curMon.name === monitorName
                ? { ...curMon, y: Math.trunc(y), x: Math.trunc(x) }
                : curMon
        )
        setCustMonitors(customMonitorsRef.current);

    }
    async function rerenderMonitors(newMonitors: FrontendMonitor[]) {
        if (app.current) {
            console.log("rerender called");
            customMonitorsRef.current = [...newMonitors];
            //deletion
            //app.current!.stage.children.forEach((child) => { child.children.forEach((child) => { child.destroy() }) });
            app.current!.stage.children = [];
            console.log("cleared");
            console.log(app.current!.stage.children);
            //rebuilding
            for (let i = 0; i < newMonitors.length; i++) {
                app.current!.stage.addChild(await createMonitorContainer(newMonitors[i]));
            }

        } else {
            console.log("app not built yet, unable to rerender");
        }
    }
    async function createMonitorContainer(monitor: FrontendMonitor): Promise<Container> {
        // Container
        const monitorContainer = new Container();
        monitorContainer.isRenderGroup = true;
        monitorContainer.x = (monitor.x / monitorScale) + screenDragOffsetTotal.current.x;
        monitorContainer.y = (monitor.y / monitorScale) + screenDragOffsetTotal.current.y;
        monitorContainer.label = monitor.name;
        monitorContainer.cursor = 'pointer';
        monitorScaleRef.current = monitorScale;
        const monitorGraphic = new Graphics();
        const monitorText = new BitmapText();
        const textBackgroundGraphic = new Graphics();




        // handles if the monitor is disabled(should not be seen and interactive)
        if (monitor.outputs[0].enabled) {
            monitorContainer.eventMode = 'static';
        } else {
            monitorContainer.eventMode = 'none';
            monitorContainer.alpha = 0;
        }
        //square
        let monitorWidth = (monitor.outputs[0].currentMode!.width / monitorScale);
        let monitorHeight = (monitor.outputs[0].currentMode!.height / monitorScale);
        //handle monitors being sideways
        if (monitor.outputs[0].rotation === Rotation.Left || monitor.outputs[0].rotation === Rotation.Right) {
            monitorWidth = (monitor.outputs[0].currentMode!.height / monitorScale);
            monitorHeight = (monitor.outputs[0].currentMode!.width / monitorScale);
        }
        console.log("Width:,", monitorWidth, "Height:", monitorHeight);

        monitorGraphic.rect(0, 0, monitorWidth, monitorHeight);
        monitorGraphic.fillStyle = 'black';
        monitorGraphic.fill();
        monitorGraphic.stroke({ width: 2, color: 'pink' });
        //Screenshot
        let monitorScreenshotSprite: Sprite | undefined;
        if (monitor.imgSrc) {
            let path = convertFileSrc(monitor.imgSrc);
            let texture = await Assets.load(path);
            monitorScreenshotSprite = new Sprite(texture);

            monitorScreenshotSprite.setSize(monitorWidth - 4, monitorHeight - 4);
            monitorScreenshotSprite.y = 2;
            monitorScreenshotSprite.x = 2;


        }

        //text
        monitorText.text = monitor.name;
        monitorText.tint = 'hotpink';
        switch (monitor.outputs[0].rotation) {
            case Rotation.Inverted:
                //Inverting
                monitorText.x = monitorWidth;
                monitorText.y = monitorHeight;
                monitorText.rotation = Math.PI;
                textBackgroundGraphic.rect(monitorWidth - monitorText.width, monitorHeight - monitorText.height, monitorText.width, monitorText.height);
                break;
            case Rotation.Right:
                //Righting
                monitorText.y = monitorHeight - monitorText.width;
                monitorText.x = monitorWidth;
                monitorText.rotation = Math.PI / 2
                textBackgroundGraphic.rect(monitorWidth - monitorText.height, monitorHeight - monitorText.width, monitorText.height, monitorText.width);
                break;
            case Rotation.Left:
                //Lefting
                monitorText.y = monitorHeight;
                monitorText.rotation = -(Math.PI / 2);
                textBackgroundGraphic.rect(0, monitorHeight - monitorText.width, monitorText.height, monitorText.width);
                break;
            default:
                textBackgroundGraphic.rect(monitorText.x, monitorText.y, monitorText.width, monitorText.height);

        }
        textBackgroundGraphic.fillStyle = 'black'
        textBackgroundGraphic.fill();

        // Setup events for mouse + touch using the pointer events
        monitorContainer.on('mousedown', onDragStart, monitorGraphic);
        monitorContainer.addChild(monitorGraphic);
        if (monitorScreenshotSprite) {
            monitorContainer.addChild(monitorScreenshotSprite)
        }
        monitorContainer.addChild(textBackgroundGraphic);
        monitorContainer.addChild(monitorText);
        monitorContainer.setSize(monitorWidth, monitorHeight);
        return monitorContainer;
    }


    function onScreenDragStart(eve: FederatedPointerEvent) {
        screenDragActive.current = true;
        previousScreenOffset.current.x = eve.globalX;
        previousScreenOffset.current.y = eve.globalY;
        app.current!.stage.on('pointermove', onScreenMove);
    }


    function onScreenMove(eve: FederatedPointerEvent) {
        let difX = eve.globalX - previousScreenOffset.current.x;
        let difY = eve.globalY - previousScreenOffset.current.y;
        previousScreenOffset.current.x = eve.globalX;
        previousScreenOffset.current.y = eve.globalY;
        screenDragOffsetTotal.current.x += difX;
        screenDragOffsetTotal.current.y += difY;
        app.current!.stage.children.forEach((child) => {
            child.x += difX;
            child.y += difY;
        });

    }
    function onScreenDragEnd() {
        if (app.current) {
            app.current!.stage.off('pointermove', onScreenMove);
        }
        screenDragActive.current = false;
    }
    function onDragMove(eve: FederatedPointerEvent) {
        let difX = eve.globalX - previousMonitorOffset.current.x;
        let difY = eve.globalY - previousMonitorOffset.current.y;
        previousMonitorOffset.current.x = eve.globalX;
        previousMonitorOffset.current.y = eve.globalY;
        if (dragTarget.current) {
            dragTarget.current.x += difX;
            dragTarget.current.y += difY;
        }
    }
    function onDragStart(eve: FederatedPointerEvent) {
        eve.target.alpha = 0.5;
        dragTarget.current = eve.target;

        initialDragX.current = eve.target.x;
        initialDragY.current = eve.target.x;

        previousMonitorOffset.current.x = eve.globalX;
        previousMonitorOffset.current.y = eve.globalY;

        app.current!.stage.on('pointermove', onDragMove);
    }

    function convertContainerPoints2MonitorPoints(x: number, y: number): point {
        return { x: (x - screenDragOffsetTotal.current.x) * monitorScaleRef.current, y: (y - screenDragOffsetTotal.current.y) * monitorScaleRef.current };
    }
    ///Generates 8 points
    function container2Points(monitor: Container): PointAndSource[] {
        //scaling it back to monitors to compare against monitors, 
        // so it can be snapped without loss of converting back and forth
        let { x: xScaled, y: yScaled } = convertContainerPoints2MonitorPoints(monitor.x, monitor.y);
        let heightScaled = monitor.height * monitorScaleRef.current;
        let widthScaled = monitor.width * monitorScaleRef.current;

        //handling redundant math
        let middleX = xScaled + (widthScaled / 2);
        let middleY = yScaled + (heightScaled / 2);
        let right = xScaled + widthScaled;
        let bottom = yScaled + heightScaled;
        return [
            // Top left
            { monitorName: monitor.label, x: xScaled, y: yScaled, pointRelative: PointRelative.TopLeft },
            { monitorName: monitor.label, x: middleX, y: yScaled, pointRelative: PointRelative.TopMiddle },
            { monitorName: monitor.label, x: right, y: yScaled, pointRelative: PointRelative.TopRight },
            { monitorName: monitor.label, x: xScaled, y: middleY, pointRelative: PointRelative.MiddleLeft },
            { monitorName: monitor.label, x: right, y: middleY, pointRelative: PointRelative.MiddleRight },
            { monitorName: monitor.label, x: xScaled, y: bottom, pointRelative: PointRelative.BottomLeft },
            { monitorName: monitor.label, x: middleX, y: bottom, pointRelative: PointRelative.BottomMiddle },
            { monitorName: monitor.label, x: right, y: bottom, pointRelative: PointRelative.BottomRight }

        ];
    }
    enum PointRelative {
        TopLeft,
        TopMiddle,
        TopRight,
        MiddleLeft,
        MiddleRight,
        BottomLeft,
        BottomMiddle,
        BottomRight
    }
    interface PointAndSource {
        monitorName: String,
        x: number,
        y: number,
        pointRelative: PointRelative
    }
    function monitor2Points(monitor: FrontendMonitor): PointAndSource[] {
        //handle rotation
        let monitorWidth = monitor.outputs[0].currentMode!.width;
        let monitorHeight = monitor.outputs[0].currentMode!.height;
        if (monitor.outputs[0].rotation === Rotation.Left || monitor.outputs[0].rotation === Rotation.Right) {
            monitorWidth = monitor.outputs[0].currentMode!.height;
            monitorHeight = monitor.outputs[0].currentMode!.width;
        }
        //handle redundant math
        let middleX = monitor.x + (monitorWidth / 2);
        let middleY = monitor.y + (monitorHeight / 2);
        let right = monitor.x + monitor.widthPx;
        let top = monitor.y;
        let bottom = monitor.y + monitor.heightPx;
        let left = monitor.x;
        return [
            { monitorName: monitor.name, x: left, y: top, pointRelative: PointRelative.TopLeft },
            { monitorName: monitor.name, x: middleX, y: top, pointRelative: PointRelative.TopMiddle },
            { monitorName: monitor.name, x: right, y: top, pointRelative: PointRelative.TopRight },
            { monitorName: monitor.name, x: left, y: middleY, pointRelative: PointRelative.MiddleLeft },
            { monitorName: monitor.name, x: right, y: middleY, pointRelative: PointRelative.MiddleRight },
            { monitorName: monitor.name, x: left, y: bottom, pointRelative: PointRelative.BottomLeft },
            { monitorName: monitor.name, x: middleX, y: bottom, pointRelative: PointRelative.BottomMiddle },
            { monitorName: monitor.name, x: right, y: bottom, pointRelative: PointRelative.BottomRight }

        ];
    }

    interface pointDiff {
        drop: PointAndSource,
        target: PointAndSource
        absDifTotal: number
    }
    function points2PointDiff(dropPoints: PointAndSource[], targetPoints: PointAndSource[]): pointDiff[] {
        let output: pointDiff[] = [];
        for (let dropPointIndex = 0; dropPointIndex < dropPoints.length; dropPointIndex++) {
            for (let targetPointIndex = 0; targetPointIndex < targetPoints.length; targetPointIndex++) {
                let drop = dropPoints[dropPointIndex];
                let target = targetPoints[targetPointIndex]
                let difX = target.x - drop.x;
                let difY = target.y - drop.y;
                output.push({
                    drop,
                    target,
                    absDifTotal: Math.abs(difX) + Math.abs(difY)
                });
            }
        }
        return output;
    }
    function relative2offset(monitorName: String, relative: PointRelative): point {
        let monitor = customMonitorsRef.current.find((mon) => (mon.name === monitorName));
        if (monitor) {
            let monitorWidth = monitor.outputs[0].currentMode!.width;
            let monitorHeight = monitor.outputs[0].currentMode!.height;
            if (monitor.outputs[0].rotation === Rotation.Left || monitor.outputs[0].rotation === Rotation.Right) {
                monitorWidth = monitor.outputs[0].currentMode!.height;
                monitorHeight = monitor.outputs[0].currentMode!.width;
            }
            //handle redundant math
            let middleX = (monitorWidth / 2);
            let middleY = (monitorHeight / 2);
            let right = monitorWidth;
            let bottom = monitorHeight;
            switch (relative) {
                case PointRelative.TopMiddle:
                    return { x: middleX, y: 0 };
                case PointRelative.TopRight:
                    return { x: right, y: 0 };
                case PointRelative.MiddleLeft:
                    return { x: 0, y: middleY };
                case PointRelative.MiddleRight:
                    return { x: right, y: middleY, };
                case PointRelative.BottomLeft:
                    return { x: 0, y: bottom, };
                case PointRelative.BottomMiddle:
                    return { x: middleX, y: bottom, };
                case PointRelative.BottomRight:
                    return { x: right, y: bottom };
                default:
                    return { x: 0, y: 0 };
            }

        } else {
            console.log("failed to find monitor during drag drop snap");
            return ({ x: 0, y: 0 })
        }
    }

    function snap(difToSnap: pointDiff) {
        if (dragTarget.current) {
            let offset = relative2offset(dragTarget.current.label, difToSnap.drop.pointRelative)
            let x = difToSnap.target.x - offset.x;
            let y = difToSnap.target.y - offset.y;
            //convert the part that snapped to the top left
            updateGlobalPosition(dragTarget.current.label, x, y)
        } else {
            console.error("tried to snap on a undefined dragtarget")
        }
    }
    function onDragEnd() {
        if (dragTarget.current && app.current) {
            if (snapEnabledRef.current) {
                let dropPoints = container2Points(dragTarget.current);
                //handle single monitors here
                let lowestDif: pointDiff = {
                    drop: {
                        monitorName: dragTarget.current.label,
                        x: dragTarget.current.x * monitorScaleRef.current,
                        y: dragTarget.current.y * monitorScaleRef.current,
                        pointRelative: PointRelative.TopLeft
                    },
                    target: {
                        monitorName: dragTarget.current.label,
                        x: dragTarget.current.x * monitorScaleRef.current,
                        y: dragTarget.current.y * monitorScaleRef.current,
                        pointRelative: PointRelative.TopLeft
                    },
                    absDifTotal: Number.MAX_VALUE
                };
                dragTarget.current.label
                for (let i = 0; i < customMonitorsRef.current.length; i++) {
                    let focusedMonitor = customMonitorsRef.current[i];
                    if (focusedMonitor.name == dragTarget.current.label || !focusedMonitor.outputs[0].enabled) {
                        continue;
                    }
                    let currentDifCollection = points2PointDiff(dropPoints, monitor2Points(focusedMonitor));
                    for (let difIndex = 0; difIndex < currentDifCollection.length; difIndex++) {
                        if (currentDifCollection[difIndex].absDifTotal < lowestDif.absDifTotal) {
                            lowestDif = currentDifCollection[difIndex];
                        }
                    }
                }
                console.log("loweset dif");
                console.log(lowestDif);
                snap(lowestDif);
            } else {
                let { x: xScaled, y: yScaled } = convertContainerPoints2MonitorPoints(dragTarget.current.x, dragTarget.current.y);
                updateGlobalPosition(dragTarget.current.label, xScaled, yScaled);
            }
            dragTarget.current.alpha = 1;
            dragTarget.current = null;

        }
        app.current!.stage.off('pointermove', onDragMove);

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
                mon.x = Math.trunc(initialMonitors.current[idx].x / monitorScale);
                mon.y = Math.trunc(initialMonitors.current[idx].y / monitorScale);
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
    function normalizePositions(monitors: FrontendMonitor[]): FrontendMonitor[] {
        if (app.current) {
            //console.log("initial XX:", initialMonitors.current[focusedMonitorIdx].x, "| YY:", initialMonitors.current[focusedMonitorIdx].y);
            let minOffsetY = Number.MAX_VALUE;
            let minOffsetX = Number.MAX_VALUE;
            //find the smallest offsets
            app.current.stage.children.forEach((mon) => {
                if (mon.alpha != 0) {
                    if (mon.x < minOffsetX) {
                        minOffsetX = mon.x;
                    }
                    if (mon.y < minOffsetY) {
                        minOffsetY = mon.y;
                    }
                }
            })
            if (minOffsetX == Number.MAX_VALUE) {
                //there are no monitors
                return monitors;
            }
            //revert the offset to normalize
            let newMonitors = [...monitors];
            app.current.stage.children.forEach((mon, idx) => {
                if (mon.alpha != 0) {
                    mon.x -= minOffsetX;
                    mon.y -= minOffsetY;
                    newMonitors[idx].x = Math.trunc(mon.x * monitorScale);
                    newMonitors[idx].y = Math.trunc(mon.y * monitorScale);
                }
            });
            setCustMonitors((oldMons) => (oldMons.map((mon, idx) => ({
                ...mon,
                x: newMonitors[idx].x,
                y: newMonitors[idx].y
            }))));
            screenDragOffsetTotal.current.x = 0;
            screenDragOffsetTotal.current.y = 0;
            return newMonitors;
            //console.log("initial XX:", initialMonitors.current[focusedMonitorIdx].x, "| YY:", initialMonitors.current[focusedMonitorIdx].y);
        }
        return monitors;
    }

    useEffect(() => {
        rerenderMonitorsContainerRef.current = rerenderMonitors;
        normalizePositionsRef.current = normalizePositions;
    }, [rerenderMonitors, normalizePositions])
    return (
        <div style={{ display: 'flex', flexDirection: "row" }}>
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
                <button style={{ width: "20vw", height: "10vh" }} onClick={resetMonitorsPositions}>Reset Monitor Positions</button>
                <button style={{ width: "20vw", height: "10vh" }} onClick={resetCameraPosition}>Reset Camera Position</button>
                <button style={{ width: "20vw", height: "10vh" }} onClick={() => normalizePositions(customMonitorsRef.current)}>Normalize Positions</button>
                <button style={{ marginBottom: "auto", width: "20vw", height: "10vh", color: snapEnabled ? 'hotpink' : '#3B3B3B' }} onClick={toggleSnap}>Toggle Snap</button>
                <h3 className='mini-titles' style={{ height: "5vh", alignContent: "end" }}>Scale</h3>
                <div style={{ height: "10vh", display: "flex", flexDirection: "row", justifyContent: "center" }}>
                    <h1 style={{ marginTop: "auto", marginBottom: "auto" }}>1:</h1>
                    <input style={{ marginTop: "auto", marginBottom: "auto", width: "9vw" }} type="number" onChange={(eve) => {
                        let newMonitorScale = Number(eve.target.value);
                        if (newMonitorScale > 0) {
                            setMonitorScale(newMonitorScale);
                        }
                    }} value={monitorScale} />
                </div>
            </div>
        </div >
    );
}
export default FreeHandPosition;
