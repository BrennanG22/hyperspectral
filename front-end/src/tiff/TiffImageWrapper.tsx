import {
    type Component,
    createEffect,
    onMount,
    on,
    Show,
    createSignal,
    type Setter,
} from "solid-js";
import type { LoadedTiffMetaData, ProcessingInput } from "./TiffImageManager";
import { TiffImageManager } from "./TiffImageManager";

type Props = {
    collectionID: string;
    reloadTrigger: number;
    renderData: ProcessingInput | undefined;
    metaDataSetter: Setter<LoadedTiffMetaData | null>;
};

type NormalizedWindow = { x: number; y: number; width: number; height: number };

type TiffError = { message: string };

const TiffImageWrapper: Component<Props> = (props) => {
    let canvasRef: HTMLCanvasElement | undefined;
    let containerRef: HTMLDivElement | undefined;

    let bitmap: ImageBitmap | undefined;
    let previewBitmap: ImageBitmap | undefined;

    let tiffManager = new TiffImageManager();

    const [isLoading, setIsLoading] = createSignal(false);
    const [error, setError] = createSignal<TiffError | null>(null);

    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    let isSelecting = false;
    let selectionStartCanvas: { x: number; y: number } | undefined;
    let selectionCurrentCanvas: { x: number; y: number } | undefined;

    const [selectedRegion, setSelectedRegion] = createSignal<NormalizedWindow | undefined>();

    const MIN_SCALE = 0.1;
    const MAX_SCALE = 20;
    const MIN_SELECTION_PX = 0;

    function getErrorMessage(err: unknown): string {
        if (err instanceof Error) {
            console.error(err);
        } else {
            console.error("Unknown TIFF error:", err);
        }
        return "We couldn't load the image. Please try again.";
    }

    function canvasToImageFraction(x: number, y: number) {
        if (!previewBitmap) return { x: 0, y: 0 };
        return {
            x: (x - offsetX) / scale / previewBitmap.width,
            y: (y - offsetY) / scale / previewBitmap.height,
        };
    }

    function fractionToCanvasSpace(fx: number, fy: number) {
        if (!previewBitmap) return { x: 0, y: 0 };
        return {
            x: fx * previewBitmap.width * scale + offsetX,
            y: fy * previewBitmap.height * scale + offsetY,
        };
    }

    function drawLiveRectangel(ctx: CanvasRenderingContext2D) {
        if (!isSelecting || !selectionStartCanvas || !selectionCurrentCanvas) return;

        const x = Math.min(selectionStartCanvas.x, selectionCurrentCanvas.x);
        const y = Math.min(selectionStartCanvas.y, selectionCurrentCanvas.y);
        const w = Math.abs(selectionCurrentCanvas.x - selectionStartCanvas.x);
        const h = Math.abs(selectionCurrentCanvas.y - selectionStartCanvas.y);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "rgba(74, 144, 255, 0.15)";
        ctx.strokeStyle = "#4a90ff";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);

        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);

        ctx.setLineDash([]);
    }

    function drawStaticRectangle(ctx: CanvasRenderingContext2D) {
        const region = selectedRegion();
        if (!region) return;

        const topLeft = fractionToCanvasSpace(region.x, region.y);
        const bottomRight = fractionToCanvasSpace(region.x + region.width, region.y + region.height);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = "#4a90ff";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);

        ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

        ctx.setLineDash([]);
    }

    function drawBitmap(ctx: CanvasRenderingContext2D) {
        if (!previewBitmap || !bitmap) return;

        const region = selectedRegion();

        if (region) {
            const regionX = region.x * previewBitmap.width;
            const regionY = region.y * previewBitmap.height;
            const regionWidthPx = region.width * previewBitmap.width;
            const regionHeightPx = region.height * previewBitmap.height;

            const scaleX = regionWidthPx / bitmap.width;
            const scaleY = regionHeightPx / bitmap.height;

            ctx.setTransform(
                scale * scaleX, 0, 0, scale * scaleY,
                offsetX + regionX * scale, offsetY + regionY * scale
            );
            ctx.drawImage(bitmap, 0, 0);
        } else {
            const scaleX = previewBitmap.width / bitmap.width;
            const scaleY = previewBitmap.height / bitmap.height;

            ctx.setTransform(scale * scaleX, 0, 0, scale * scaleY, offsetX, offsetY);
            ctx.drawImage(bitmap, 0, 0);
        }
    }

    function draw() {
        if (!canvasRef || !previewBitmap) return;

        const ctx = canvasRef.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);

        ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
        ctx.drawImage(previewBitmap, 0, 0);

        drawStaticRectangle(ctx);

        if (bitmap) drawBitmap(ctx);

        drawLiveRectangel(ctx);
    }

    function handleWheel(e: WheelEvent) {
        e.preventDefault();
        if (!canvasRef) return;

        const { x, y } = screenToCanvas(e.clientX, e.clientY);

        const imgX = (x - offsetX) / scale;
        const imgY = (y - offsetY) / scale;

        const zoomFactor = Math.exp(-e.deltaY * 0.001);
        let newScale = scale * zoomFactor;
        newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));

        offsetX = x - imgX * newScale;
        offsetY = y - imgY * newScale;
        scale = newScale;

        draw();
    }

    function screenToCanvas(clientX: number, clientY: number) {
        const rect = canvasRef!.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (canvasRef!.width / rect.width),
            y: (clientY - rect.top) * (canvasRef!.height / rect.height),
        };
    }

    function handlePointerDown(e: PointerEvent) {
        if (e.shiftKey) {
            isSelecting = true;

            const pt = screenToCanvas(e.clientX, e.clientY);
            selectionStartCanvas = pt;
            selectionCurrentCanvas = pt;

            canvasRef?.setPointerCapture(e.pointerId);
            return;
        }

        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;

        canvasRef?.setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: PointerEvent) {
        if (isSelecting) {
            selectionCurrentCanvas = screenToCanvas(e.clientX, e.clientY);
            draw();
            return;
        }

        if (!isDragging || !canvasRef) return;

        const rect = canvasRef.getBoundingClientRect();
        const scaleFactorX = canvasRef.width / rect.width;
        const scaleFactorY = canvasRef.height / rect.height;

        const dx = (e.clientX - lastX) * scaleFactorX;
        const dy = (e.clientY - lastY) * scaleFactorY;

        offsetX += dx;
        offsetY += dy;

        lastX = e.clientX;
        lastY = e.clientY;

        draw();
    }

    function handlePointerUp(e: PointerEvent) {
        if (isSelecting) {
            isSelecting = false;
            canvasRef?.releasePointerCapture(e.pointerId);

            if (selectionStartCanvas && selectionCurrentCanvas) {
                const x0 = Math.min(selectionStartCanvas.x, selectionCurrentCanvas.x);
                const y0 = Math.min(selectionStartCanvas.y, selectionCurrentCanvas.y);
                const x1 = Math.max(selectionStartCanvas.x, selectionCurrentCanvas.x);
                const y1 = Math.max(selectionStartCanvas.y, selectionCurrentCanvas.y);

                if (x1 - x0 > MIN_SELECTION_PX && y1 - y0 > MIN_SELECTION_PX) {
                    const topLeftFrac = canvasToImageFraction(x0, y0);
                    const bottomRightFrac = canvasToImageFraction(x1, y1);

                    onSelectionUpdated({
                        x: topLeftFrac.x,
                        y: topLeftFrac.y,
                        width: bottomRightFrac.x - topLeftFrac.x,
                        height: bottomRightFrac.y - topLeftFrac.y,
                    });
                }
            }

            selectionStartCanvas = undefined;
            selectionCurrentCanvas = undefined;

            draw();
            return;
        }

        isDragging = false;
        canvasRef?.releasePointerCapture(e.pointerId);
    }

    function onSelectionUpdated(region: NormalizedWindow | undefined) {
        setSelectedRegion(region);
        bitmap = undefined;
        draw();
    }

    onMount(() => {
        if (!canvasRef || !containerRef) return;

        const rect = containerRef.getBoundingClientRect();
        canvasRef.width = rect.width;
        canvasRef.height = rect.height;

        try {
            tiffManager = new TiffImageManager();

            canvasRef.addEventListener("wheel", handleWheel, { passive: false });
            canvasRef.addEventListener("pointerdown", handlePointerDown);
            canvasRef.addEventListener("pointermove", handlePointerMove);
            canvasRef.addEventListener("pointerup", handlePointerUp);
            canvasRef.addEventListener("pointerleave", handlePointerUp);
        } catch (err) {
            console.error("Failed to initialize TIFF manager:", err);

            setError({
                message: "The image could not be inatalized, please reolad the page and try again",
            });
        }
    });

    async function renderMap() {
        if (!tiffManager || !props.renderData) return;

        setIsLoading(true);
        setError(null);

        try {
            const region = selectedRegion();

            if (region) {
                props.renderData.data.region = [
                    Math.max(region.x, 0),
                    Math.max(region.y, 0),
                    Math.min(region.width + region.x, 1),
                    Math.min(region.height + region.y, 1),
                ];
            } else {
                props.renderData.data.region = [0, 0, 1, 1];
            }

            const image = await tiffManager.getImage(props.renderData);
            if (!image) throw new Error("The TIFF manager returned no image.");

            bitmap = await createImageBitmap(image);
            draw();
        } catch (err) {
            bitmap = undefined;
            const message = getErrorMessage(err);

            setError({
                message: `The image couldnt be rendered. Please try again. ${err}`,
            });

            console.error(message);
        } finally {
            setIsLoading(false);
        }
    }

    async function renderPreview() {
        if (!tiffManager || !canvasRef || props.collectionID === "") return;

        previewBitmap = await TiffImageManager.getPreviewImage(props.collectionID);
        if (!previewBitmap) throw new Error("No preview image was returned.");

        const fitToScaleWidth = canvasRef.width / previewBitmap.width;
        const fitToScaleHeight = canvasRef.height / previewBitmap.height;
        scale = Math.min(fitToScaleWidth, fitToScaleHeight);

        offsetX = (canvasRef.width - previewBitmap.width * scale) / 2;
        offsetY = (canvasRef.height - previewBitmap.height * scale) / 2;

        draw();
    }

    async function loadCollection(collectionID: string) {
        if (!tiffManager || collectionID === "") return;

        setError(null);
        setIsLoading(true);

        bitmap = undefined;
        previewBitmap = undefined;

        try {
            await renderPreview();
            await tiffManager.loadTiff(collectionID);

            const metadata = tiffManager.getMetadata();
            if (!metadata) throw new Error("The TIFF manager returned no metadata.");

            props.metaDataSetter(metadata);
        } catch (err) {
            bitmap = undefined;
            previewBitmap = undefined;

            console.error("Failed to load TIFF:", err);
            props.metaDataSetter(null);

            setError({
                message: "We couldn't load this image. Please try again.",
                retry: async () => {
                    await loadCollection(collectionID);
                },
            });
        } finally {
            setIsLoading(false);
        }
    }

    createEffect(
        on(
            () => props.reloadTrigger,
            async () => {
                if (!tiffManager || isLoading() || props.collectionID === "") return;
                await renderMap();
            },
            { defer: true }
        )
    );

    createEffect(
        on(
            () => props.collectionID,
            async (collectionID) => {
                if (!tiffManager || collectionID === "") {
                    props.metaDataSetter(null);
                    return;
                }
                await loadCollection(collectionID);
            },
            { defer: true }
        )
    );

    return (
        <div ref={containerRef} class="relative h-full w-full">
            <canvas
                ref={canvasRef}
                class="block h-full w-full"
                style={{ "touch-action": "none", cursor: "grab" }}
            />

            <Show when={props.collectionID === ""}>
                <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span class="select-none text-sm text-gray-400">
                        Select a collection from the right side bar to view its image
                    </span>
                </div>
            </Show>

            <Show when={selectedRegion()}>
                <button
                    type="button"
                    onClick={() => onSelectionUpdated(undefined)}
                    class="absolute bottom-4 left-4 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-lg hover:bg-gray-100"
                >
                    Clear selection
                </button>
            </Show>

            <Show when={isLoading()}>
                <div class="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div
                        class="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent"
                        aria-label="Loading image"
                    />
                </div>
            </Show>

            <Show when={error()}>
                {(currentError) => (
                    <div class="absolute inset-0 flex items-center justify-center bg-black/40">
                        <div role="alert" class="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                            <div class="mb-3 flex items-center gap-3">
                                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 font-bold text-red-600">
                                    !
                                </div>
                                <h2 class="font-semibold text-gray-900">Unable to load image</h2>
                            </div>

                            <p class="text-sm leading-5 text-gray-600">{currentError().message}</p>

                            <div class="mt-5 flex justify-end">
                                <button
                                    type="button"
                                    disabled={isLoading()}
                                    onClick={() => { setError(null) }}
                                    class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
                                >
                                    Try again
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </Show>
        </div>
    );
};

export default TiffImageWrapper;

