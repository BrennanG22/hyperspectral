export default function UnsupportedDevice() {
  return (
    <div class="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#080b10] px-6 text-center text-[#e7eaee]">
      <p class="text-[10px] font-medium uppercase tracking-[0.2em] text-[#4a90ff]">
        Spectral Analysis
      </p>
      <h1 class="text-lg font-medium tracking-tight text-[#f4f6f8]">
        Desktop only, for now
      </h1>
      <p class="max-w-sm text-sm leading-relaxed text-[#8d98a7]">
        This tool needs a wider screen and has a high memory demand to show the imagery viewer and controls side by side.
        Please open it on a laptop or desktop browser instead, ensuring that the window is maximized.
      </p>
    </div>
  );
}
