import { createSignal, createMemo, Show } from "solid-js";
import type { BandArrayMetaData } from "../tiff/TiffImageManager";

type BandRow = {
  index: number;
  wavelength: number;
  fwhm: number;
  name: string;
};

function toBandRows(bandData: BandArrayMetaData): BandRow[] {
  const { bands, fwhm, commanNames } = bandData;
  if (bands.length !== fwhm.length || bands.length !== commanNames.length) {
    console.warn(
      `BandArrayMetaData arrays are misaligned: bands=${bands.length}, fwhm=${fwhm.length}, commanNames=${commanNames.length}`
    );
  }
  return bands.map((wavelength, i): BandRow => ({
    index: i,
    wavelength: Math.round(wavelength * 1000),
    fwhm: fwhm[i] ?? NaN,
    name: commanNames[i] ?? "",
  }));
}

export default function BandTable(props: { bandData: BandArrayMetaData }) {
  const [isOpen, setIsOpen] = createSignal<boolean>(false);
  const rows = createMemo<BandRow[]>(() => toBandRows(props.bandData));

  return (
    <div class="rounded-lg border border-[#232830]">
      <button
        type="button"
        class="flex w-full items-center justify-between px-3 py-2 text-left text-[9px] font-medium uppercase tracking-[0.1em] text-[#697382] hover:text-[#8b96a5]"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen()}
      >
        <span>Band reference ({rows().length})</span>
        <span
          class="text-[15px] transition-transform duration-150"
          style={{ transform: isOpen() ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          {">"}
        </span>
      </button>

      <Show when={isOpen()}>
        <div class="max-h-56 overflow-y-auto border-t border-[#232830]">
          <table class="w-full border-collapse text-left text-[11px]">
            <thead class="sticky top-0 bg-[#0d1117]">
              <tr class="text-[9px] uppercase tracking-[0.1em] text-[#697382]">
                <th class="px-3 py-2 font-medium">Band Expression</th>
                <th class="px-3 py-2 font-medium">Wavelength (nm)</th>
                <th class="px-3 py-2 font-medium">FWHM</th>
                <th class="px-3 py-2 font-medium">Name</th>
              </tr>
            </thead>
            <tbody>
              {rows().map((r: BandRow) => (
                <tr class="border-t border-[#1c2128] text-[#aeb8c6] hover:bg-[#11151c]">
                  <td class="px-3 py-1.5 font-mono text-[#4a90ff]">b{r.index}</td>
                  <td class="px-3 py-1.5">{r.wavelength}</td>
                  <td class="px-3 py-1.5">{r.fwhm}</td>
                  <td class="px-3 py-1.5">{r.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
