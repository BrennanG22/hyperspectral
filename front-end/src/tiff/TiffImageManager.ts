import * as GeoTIFF from "geotiff";
import { getAssetURL, getPreviewPNG } from "./urlHelper";
import { evaluateIndicesExpressionGPU } from "./indicesProcessor";
import { rgbScallerGenerator, scallerGenerator } from "./heatMapGenerator";

const NAN_NUMBER = 65535;

export type LoadedTiffMetaData = {
	collectionID: string;
	bandData: BandArrayMetaData;
	qualityLevels: string[];
	dimensions: { width: number; height: number }[];
};

export type BandArrayMetaData = {
	bands: number[];
	fwhm: number[];
	commanNames: string[];
}

type CachedTiffBandData = {
	data: Uint8Array;
	band: number;
	qualityLevel: number;
	region: [number, number, number, number];
	collectionID: string;
};

export type ProcessingInputModes = "RGB" | "SC";

export type ProcessingInput =
	| { mode: "RGB"; data: RGBData }
	| { mode: "SC"; data: SCData };

export interface RGBData {
	region: [number, number, number, number];
	qualityLevel: number;
	redExpression: string;
	greenExpression: string;
	blueExpression: string;
}

export interface SCData {
	region: [number, number, number, number];
	qualityLevel: number;
	expression: string;
}

let sharedPool: GeoTIFF.Pool | null = null;

function getPool(): GeoTIFF.Pool {
	if (!sharedPool) {
		sharedPool = new GeoTIFF.Pool();
	}
	return sharedPool;
}

export class TiffImageManager {
	private loadedTiff: GeoTIFF.GeoTIFF | undefined;
	private tiffMetaData: LoadedTiffMetaData | undefined;

	private cache: Map<string, CachedTiffBandData> = new Map();

	private device: GPUDevice | null = null;

	private gpuReady: Promise<void>;

	constructor() {
		this.gpuReady = this.initGPU();
	}


	private async initGPU(): Promise<void> {
		if (!("gpu" in navigator) || !navigator.gpu) {
			console.warn("WebGPU is not supported in this browser.");
			return;
		}

		try {
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) {
				console.warn("No WebGPU adapter available.");
				return;
			}

			this.device = await adapter.requestDevice({
				requiredLimits: {
					maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
					maxBufferSize: adapter.limits.maxBufferSize,
				},
			});
		} catch (err) {
			console.error("Failed to initialize WebGPU device:", err);
		}
	}


	public getMetadata(): Readonly<LoadedTiffMetaData> | undefined {
		return this.tiffMetaData;
	}


	public invalidateRasterCache(): void {
		this.cache.clear();
		void this.clearGeotiffInternalTileCache();
	}


	private async clearGeotiffInternalTileCache(): Promise<void> {
		// if (!this.loadedTiff || !this.tiffMetaData) {
		// 	return;
		// }
		//
		// for (const level of this.tiffMetaData.qualityLevels) {
		// 	try {
		// 		const image = await this.loadedTiff.getImage(level);
		// 		image.tiles = [];
		// 	} catch (err) {
		// 		console.warn(`Failed to clear geotiff tile cache for level ${level}:`, err);
		// 	}
		// }
	}


	public async loadTiff(collectionID: string, retryCount?: number): Promise<void> {
		if (this.tiffMetaData?.collectionID === collectionID) {
			return;
		}

		await this.clearGeotiffInternalTileCache();

		try {
			this.loadedTiff = await GeoTIFF.fromUrl(
				getAssetURL(collectionID, "TIFF"),
				{
					blockSize: 65536 * 1024,
					cacheSize: 1,
				} as any
			);
		}
		catch {
			if (!retryCount) retryCount = 0;
			if (retryCount > 3) {
				return Promise.reject("Failed to load tiff after 3 tries")
			}
			return this.loadTiff(collectionID, retryCount + 1);
		}

		const imageCount = await this.loadedTiff.getImageCount();
		const dimensions: { width: number; height: number }[] = [];
		const qualityLevels: string[] = [];

		for (let level = 0; level < imageCount; level++) {
			const image = await this.loadedTiff.getImage(level);
			const width = image.getWidth();
			const height = image.getHeight();

			dimensions.push({ width, height });
			qualityLevels.push(`${width}x${height}`);
			image.tiles = [];
		}

		const bandData = await this.getTiffJSONData(collectionID);

		this.tiffMetaData = {
			collectionID,
			bandData,	
			qualityLevels,
			dimensions,
		};
		this.cache.clear();
	}

	public async getTiffJSONData(collectionId: string): Promise<BandArrayMetaData> {
		const metaData = await fetch(getAssetURL(collectionId, "METADATA"));

		const data = await metaData.json();


		const eoBands =
			data["assets"]["Cloud optimized GeoTiff"]["eo:bands"];

		const bands: number[] = eoBands.map(
			(band: any) => band.center_wavelength
		);

		const common_names: string[] = eoBands.map(
			(band: any) => band.common_name
		);

		const fwhm: number[] = eoBands.map(
			(band: any) => band.full_width_half_max
		);

		return {
			bands: bands,
			fwhm: fwhm,
			commanNames: common_names
		}
	}


	public async getImage(processingModeData: ProcessingInput): Promise<ImageData> {
		switch (processingModeData.mode) {
			case "RGB":
				return this.rgbIndexRender(processingModeData.data);
			case "SC":
				return this.scIndexRender(processingModeData.data);
			default:
				throw new Error(
					`Processing mode "${(processingModeData as ProcessingInput).mode}" is not implemented`
				);
		}
	}


	public static async getPreviewImage(collectionId: string) {
		return getPreviewPNG(collectionId);
	}


	private async rgbIndexRender(renderData: RGBData): Promise<ImageData> {
		await this.gpuReady;

		if (!this.device) {
			throw new Error("WebGPU device is not available. Please try enabling Graphics Acceleration in your browser settings.");
		}

		if (!this.tiffMetaData) {
			throw new Error("Tiff must be loaded before rendering.");
		}

		const expressions = [
			renderData.redExpression,
			renderData.greenExpression,
			renderData.blueExpression,
		];

		const bandRegex = /\bb(\d+)\b/g;

		const uniqueBands = [
			...new Set(
				expressions.flatMap((expr) =>
					[...expr.matchAll(bandRegex)].map((m) => Number(m[1]))
				)
			),
		];

		const dims = this.tiffMetaData.dimensions[renderData.qualityLevel];

		if (!dims) {
			throw new Error(
				`No dimensions found for quality level ${renderData.qualityLevel}.`
			);
		}

		const pixelRegion: [number, number, number, number] = [
			Math.round(renderData.region[0] * dims.width),
			Math.round(renderData.region[1] * dims.height),
			Math.round(renderData.region[2] * dims.width),
			Math.round(renderData.region[3] * dims.height),
		];

		const regionWidth = pixelRegion[2] - pixelRegion[0];
		const regionHeight = pixelRegion[3] - pixelRegion[1];

		const rgbaData = await (async () => {
			const [rasterData, bandOrder] = await this.loadRasters(
				renderData.qualityLevel,
				uniqueBands,
				pixelRegion
			);

			const [redResult, greenResult, blueResult] = await Promise.all([
				evaluateIndicesExpressionGPU(
					this.device!,
					renderData.redExpression,
					rasterData,
					bandOrder,
					NAN_NUMBER
				),

				evaluateIndicesExpressionGPU(
					this.device!,
					renderData.greenExpression,
					rasterData,
					bandOrder,
					NAN_NUMBER
				),

				evaluateIndicesExpressionGPU(
					this.device!,
					renderData.blueExpression,
					rasterData,
					bandOrder,
					NAN_NUMBER
				),
			]);

			const rgbaData = rgbScallerGenerator(
				redResult,
				greenResult,
				blueResult,
				NAN_NUMBER
			);

			return rgbaData;
		})();

		if (this.loadedTiff) {
			try {
				const image = await this.loadedTiff.getImage(renderData.qualityLevel);
				image.tiles = [];
			} catch (err) {
				console.warn(
					`Failed to clear geotiff tile cache for level ${renderData.qualityLevel}:`,
					err
				);
			}
		}

		return new ImageData(
			rgbaData,
			regionWidth,
			regionHeight
		);
	}


	private async scIndexRender(renderData: SCData): Promise<ImageData> {
		await this.gpuReady;

		if (!this.device) {
			throw new Error("WebGPU device is not available. Please try enabling Graphics Acceleration in your browser settings.");
		}

		if (!this.tiffMetaData) {
			throw new Error("Tiff must be loaded before rendering.");
		}

		const bandRegex = /\bb(\d+)\b/g;
		const uniqueBands = [
			...new Set(
				[...renderData.expression.matchAll(bandRegex)]
					.map((m) => Number(m[1]))
			),
		];

		const dims = this.tiffMetaData.dimensions[renderData.qualityLevel];

		if (!dims) {
			throw new Error(
				`No dimensions found for quality level ${renderData.qualityLevel}.`
			);
		}

		const pixelRegion: [number, number, number, number] = [
			Math.round(renderData.region[0] * dims.width),
			Math.round(renderData.region[1] * dims.height),
			Math.round(renderData.region[2] * dims.width),
			Math.round(renderData.region[3] * dims.height),
		];

		const regionWidth = pixelRegion[2] - pixelRegion[0];
		const regionHeight = pixelRegion[3] - pixelRegion[1];

		const rgbaData = await (async () => {
			const [rasterData, bandOrder] = await this.loadRasters(
				renderData.qualityLevel,
				uniqueBands,
				pixelRegion
			);

			const data = await evaluateIndicesExpressionGPU(this.device!, renderData.expression, rasterData, bandOrder, NAN_NUMBER);
			return scallerGenerator(data, NAN_NUMBER);
		})();

		if (this.loadedTiff) {
			try {
				const image = await this.loadedTiff.getImage(renderData.qualityLevel);
				image.tiles = [];
			} catch (err) {
				console.warn(
					`Failed to clear geotiff tile cache for level ${renderData.qualityLevel}:`,
					err
				);
			}
		}

		return new ImageData(
			rgbaData,
			regionWidth,
			regionHeight
		);

	}


	private async loadRasters(
		qualityLevel: number,
		bands: number[],
		region: [number, number, number, number]
	): Promise<[Float32Array[], number[]]> {
		if (!this.loadedTiff) {
			throw new Error("Tiff must be loaded first");
		}

		const rasterBands: Float32Array[] = [];
		const bandsToFetch: number[] = [];
		const bandOrder: number[] = [];

		// Log the region being requested
		console.log(`Loading rasters for quality ${qualityLevel}, bands ${bands}, region [${region.join(', ')}]`);

		for (const band of bands) {
			const key = this.getCacheKey(band, qualityLevel, region);
			const cacheData = this.cache.get(key);

			if (cacheData) {
				// console.log(`Cache hit for band ${band}`);
				// // const raster = this.decompressRaster(cacheData.data);
				// rasterBands.push(raster);
				// bandOrder.push(band);
			} else {
				console.log(`Cache miss for band ${band}, will fetch`);
				bandsToFetch.push(band);
			}
		}

		if (bandsToFetch.length === 0) {
			return [rasterBands, bandOrder];
		}

		const image = await this.loadedTiff.getImage(qualityLevel);

		console.log(`Fetching bands ${bandsToFetch} with window [${region.join(', ')}]`);

		const fetchedRasters = await image.readRasters({
			samples: bandsToFetch,
			interleave: false,
			window: region,
			pool: getPool(),
		});

		console.log(`Fetched ${fetchedRasters.length} rasters`);

		for (let i = 0; i < fetchedRasters.length; i++) {
			const raster = new Float32Array(fetchedRasters[i]);
			rasterBands.push(raster);
			bandOrder.push(bandsToFetch[i]);

			// this.cacheBand(raster, bandsToFetch[i], qualityLevel, region);
		}

		return [rasterBands, bandOrder];
	}


	// private cacheBand(
	// 	data: Float32Array,
	// 	band: number,
	// 	qualityLevel: number,
	// 	region: [number, number, number, number]
	// ): void {
	// 	const rawBytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	// 	const compressedArray = deflateSync(rawBytes);
	//
	// 	this.cache.set(this.getCacheKey(band, qualityLevel, region), {
	// 		data: compressedArray,
	// 		band,
	// 		qualityLevel,
	// 		region,
	// 		collectionID: this.tiffMetaData?.collectionID ?? "",
	// 	});
	// }
	//
	//
	// private decompressRaster(data: Uint8Array): Float32Array {
	// 	const decompressed = inflateSync(data);
	// 	const aligned = new Uint8Array(decompressed.byteLength);
	// 	aligned.set(decompressed);
	// 	return new Float32Array(aligned.buffer, 0, aligned.byteLength / Float32Array.BYTES_PER_ELEMENT);
	// }


	private getCacheKey(
		band: number,
		qualityLevel: number,
		region: [number, number, number, number]
	): string {
		return `${band}-${qualityLevel}-${region.join(",")}`;
	}
}

