import { Application, Container, ContainerChild, FederatedPointerEvent, Graphics, ICanvas, BitmapText, Sprite, Assets } from 'pixi.js';

import { useState, useRef, Dispatch, SetStateAction, MutableRefObject, useEffect } from 'react';
import { FrontendMonitor, point as Point, Rotation } from '../globalValues';
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

    // function onWheelChange(eve: FederatedWheelEvent) {
    //     console.log("scroll wheen unit:" + eve.deltaY);
    //     if (eve.deltaY > 0) {
    //         monitorScale.current = monitorScale.current + 1;

    //     } else {
    //         monitorScale.current = monitorScale.current - 1;

    //     }
    //     rerenderMonitors(customMonitors);
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
    async function rerenderMonitors(newMonitors: FrontendMonitor[]) {
        if (app.current) {
            console.log("rerender called");
            //deletion
            //app.current!.stage.children.forEach((child) => { child.children.forEach((child) => { child.destroy() }) });
            app.current!.stage.children = [];
            console.log("cleared");
            console.log(app.current!.stage.children);
            //rebuilding
            for (let i = 0; i < newMonitors.length; i++) {
                app.current!.stage.addChild(await createMonitorContainer(newMonitors[i]));
            }
            console.log("done");
            console.log(app.current!.stage.children);

        } else {
            console.log("app not built yet, unable to rerender");
        }
    }
    async function createMonitorContainer(monitor: FrontendMonitor): Promise<Container> {
        // Container
        const monitorContainer = new Container();
        monitorContainer.isRenderGroup = true;
        monitorContainer.x = monitor.x / monitorScale + screenDragOffsetTotal.current.x;
        monitorContainer.y = monitor.y / monitorScale + screenDragOffsetTotal.current.y;
        monitorContainer.label = monitor.name;
        monitorContainer.cursor = 'pointer';
        const monitorGraphic = new Graphics();
        const monitorText = new BitmapText();
        const textBackgroundGraphic = new Graphics();




        // handles if the monitor is disabled(should not be seen and interactive)
        if (monitor.outputs[0].enabled) {
            monitorContainer.eventMode = 'static';
        } else {
            console.log("DISABLED ON FREEHANDTSX")
            console.log(monitor);
            monitorContainer.eventMode = 'none';
            monitorContainer.alpha = 0;
        }
        //square
        let monitorWidth = monitor.outputs[0].currentMode!.width / monitorScale;
        let monitorHeight = monitor.outputs[0].currentMode!.height / monitorScale;
        //handle monitors being sideways
        if (monitor.outputs[0].rotation === Rotation.Left || monitor.outputs[0].rotation === Rotation.Right) {
            monitorWidth = monitor.outputs[0].currentMode!.height / monitorScale;
            monitorHeight = monitor.outputs[0].currentMode!.width / monitorScale;
        }
        console.log("Width:,", monitorWidth, "Height:", monitorHeight);

        monitorGraphic.rect(0, 0, monitorWidth, monitorHeight);
        monitorGraphic.fillStyle = 'black';
        monitorGraphic.fill();
        monitorGraphic.stroke({ width: 2, color: 'pink' });
        //Screenshot
        let monitorScreenshotSprite: Sprite | undefined;
        if (monitor.imgSrc) {
            console.log(monitor.imgSrc);
            let path = convertFileSrc(monitor.imgSrc);
            console.log(path);
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
        console.log(monitorText.x, "|", monitorText.y, "|", monitorText.width, "|", monitorText.height, "|", monitorText.scale.x, monitorText.scale.y);
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

    ///Generates 8 points
    /// Top left, Top Middle, Top Right
    /// Left Middle , Right Middle
    //  Bottom Left, Bottome Middle, Bottom Right
    function container2Points(monitor: Container): Point[] {
        //handling redundant math
        let middleX = monitor.x + (monitor.width / 2);
        let middleY = monitor.y + (monitor.height / 2);
        let right = monitor.x + monitor.width;
        let bottom = monitor.y + monitor.height;
        return [
            // Top left
            { x: monitor.x, y: monitor.y },
            // Top Middle
            { x: middleX, y: monitor.y },
            // Top Right
            { x: right, y: monitor.y },
            //Left Middle
            { x: monitor.x, y: middleY },
            //Right Middle
            { x: right, y: middleY },
            //Bottom Left
            { x: monitor.x, y: bottom },
            //Bottom Middle
            { x: middleX, y: bottom },
            //Bottom Right
            { x: right, y: bottom }

        ];
    }
    interface pointDiff {
        difX: number,
        difY: number,
        absDifTotal: number
    }
    function points2PointDiff(dropPoints: Point[], targetPoints: Point[]): pointDiff[] {
        let output: pointDiff[] = [];
        for (let dropPointIndex = 0; dropPointIndex < dropPoints.length; dropPointIndex++) {
            for (let targetPointIndex = 0; targetPointIndex < targetPoints.length; targetPointIndex++) {
                let difX = targetPoints[targetPointIndex].x - dropPoints[dropPointIndex].x;
                let difY = targetPoints[targetPointIndex].y - dropPoints[dropPointIndex].y;
                output.push({
                    difX,
                    difY,
                    absDifTotal: Math.abs(difX) + Math.abs(difY)
                });
            }
        }
        return output;
    }

    function onDragEnd() {
        if (dragTarget.current && app.current) {
            if (snapEnabledRef.current) {
                let dropPoints = container2Points(dragTarget.current);
                let lowestDif: pointDiff = { difX: 0, difY: 0, absDifTotal: Number.MAX_VALUE };
                for (let i = 0; i < app.current.stage.children.length; i++) {
                    if (app.current.stage.children[i] == dragTarget.current) {
                        continue;
                    }
                    let currentDifCollection = points2PointDiff(dropPoints, container2Points(app.current.stage.children[i]));
                    for (let difIndex = 0; difIndex < currentDifCollection.length; difIndex++) {
                        if (currentDifCollection[difIndex].absDifTotal < lowestDif.absDifTotal) {
                            lowestDif = currentDifCollection[difIndex];
                        }
                    }
                }
                console.log("Lowest: ", lowestDif);
                dragTarget.current.x += lowestDif.difX;
                dragTarget.current.y += lowestDif.difY;
            }
            updateGlobalPosition(dragTarget.current.label, (dragTarget.current.x - screenDragOffsetTotal.current.x) * monitorScale, (dragTarget.current.y - screenDragOffsetTotal.current.y) * monitorScale);

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
    function normalizePositions(monitors: FrontendMonitor[]): FrontendMonitor[] {
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
                return monitors;
            }
            //revert the offset to normalize
            let newMonitors = [...customMonitors];
            app.current.stage.children.forEach((mon, idx) => {
                mon.x -= minOffsetX;
                mon.y -= minOffsetY;
                newMonitors[idx].x = mon.x * monitorScale;
                newMonitors[idx].y = mon.y * monitorScale;
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
                <button style={{ width: "20vw", height: "10vh" }} onClick={() => normalizePositions(customMonitors)}>Normalize Positions</button>
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
