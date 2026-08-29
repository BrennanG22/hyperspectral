export function scallerGenerator(data: Float32Array, nanValue: number) {
	let min = Infinity;
	let max = -Infinity;
	let noDataCount = 0;
	let dataCount = 0;

	for (let i = 0; i < data.length; i++) {
		if (data[i] === nanValue) {
			noDataCount++;
			continue;
		}
		dataCount++;
		if (data[i] > max) max = data[i];
		if (data[i] < min) min = data[i];
	}

	const range = max - min || 1;
	const rgbaData = new Uint8ClampedArray(data.length * 4);
	for (let i = 0; i < data.length; i++) {
		const idx = i * 4;
		if (data[i] === nanValue) {
			rgbaData[idx] = 0;
			rgbaData[idx + 1] = 0;
			rgbaData[idx + 2] = 0;
			rgbaData[idx + 3] = 0;
			continue;
		}
		const t = (data[i] - min) / range;
		const [r, g, b] = gradient(t);
		rgbaData[idx] = r;
		rgbaData[idx + 1] = g;
		rgbaData[idx + 2] = b;
		rgbaData[idx + 3] = 255;
	}
	return rgbaData;
}

const STOPS = [
	{ t: 0.00, color: [0, 0, 255] },     // Blue
	{ t: 0.50, color: [0, 255, 0] },     // Green
	{ t: 0.75, color: [255, 255, 0] },   // Yellow
	{ t: 1.00, color: [255, 0, 0] },     // Red
] as const;

function gradient(t: number): [number, number, number] {
	t = Math.max(0, Math.min(1, t));

	// Find the two surrounding stops
	for (let i = 0; i < STOPS.length - 1; i++) {
		const a = STOPS[i];
		const b = STOPS[i + 1];

		if (t >= a.t && t <= b.t) {
			const p = (t - a.t) / (b.t - a.t);

			return [
				Math.round(a.color[0] + (b.color[0] - a.color[0]) * p),
				Math.round(a.color[1] + (b.color[1] - a.color[1]) * p),
				Math.round(a.color[2] + (b.color[2] - a.color[2]) * p),
			];
		}
	}

	return [...STOPS[STOPS.length - 1].color] as [number, number, number];
}

export function rgbScallerGenerator(
	red: Float32Array,
	green: Float32Array,
	blue: Float32Array,
	nanValue: number
) {
	const length = red.length;

	console.log(nanValue)

	const scaleChannel = (data: Float32Array) => {
		let min = Infinity;
		let max = -Infinity;
		for (let i = 0; i < data.length; i++) {
			if (data[i] === nanValue) continue;
			if (data[i] > max) max = data[i];
			if (data[i] < min) min = data[i];
		}
		const range = max - min || 1;
		return { min, range };
	};

	const r = scaleChannel(red);
	const g = scaleChannel(green);
	const b = scaleChannel(blue);

	const rgbaData = new Uint8ClampedArray(length * 4);

	for (let i = 0; i < length; i++) {
		const idx = i * 4;

		const isNan = red[i] === nanValue || green[i] === nanValue || blue[i] === nanValue;
		if (isNan) {
			rgbaData[idx] = 0;
			rgbaData[idx + 1] = 0;
			rgbaData[idx + 2] = 0;
			rgbaData[idx + 3] = 0;
			continue;
		}

		const rt = (red[i] - r.min) / r.range;
		const gt = (green[i] - g.min) / g.range;
		const bt = (blue[i] - b.min) / b.range;

		rgbaData[idx] = Math.round(Math.max(0, Math.min(1, rt)) * 255);
		rgbaData[idx + 1] = Math.round(Math.max(0, Math.min(1, gt)) * 255);
		rgbaData[idx + 2] = Math.round(Math.max(0, Math.min(1, bt)) * 255);
		rgbaData[idx + 3] = 255;
	}

	return rgbaData;
}
