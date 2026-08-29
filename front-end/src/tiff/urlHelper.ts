const BASE_URL = "https://bucket.brennang.com";
const MANIFEST_URL = BASE_URL + "/manifest.txt"

type asset_types = "TIFF" | "CLOUD" | "PREVIEW" | "METADATA";



export function getAssetURL(collectionID: string, asset_type: asset_types): string {
	switch (asset_type) {
		case "TIFF":
			return `${BASE_URL}/${collectionID}/main_tiff.tiff`;
		case "CLOUD":
			return `${BASE_URL}/${collectionID}/cloud_tiff.tiff`;
		case "PREVIEW":
			return `${BASE_URL}/${collectionID}/preview.png`;
		case "METADATA":
			return `${BASE_URL}/${collectionID}/metadata.json`;
	}
}


export async function getCollections(): Promise<string[]> {
	const res = await fetch(MANIFEST_URL);

	if (!res.ok) {
		throw new Error(`Failed to fetch manifest: ${res.status}`);
	}

	const text = await res.text();

	return text
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean);
}

export async function getPreviewPNG(collectionID: string): Promise<ImageBitmap> {
	const response = await fetch(getAssetURL(collectionID, "PREVIEW"));
	const blob = await response.blob();

	const imageBitmap = await createImageBitmap(blob);
	return imageBitmap;
}

