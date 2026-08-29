import { useNavigate } from "@solidjs/router";
import { For } from "solid-js";

export default function LandingPage() {
  const navigate = useNavigate();

  const bands = [
    { nm: 500, label: "Blue" },
    { nm: 550, label: "Green" },
    { nm: 650, label: "Red" },
    { nm: 750, label: "NIR" },
    { nm: 800, label: "SWIR" },
  ];


  return (
    <div class="min-h-screen bg-[#0A0D12] text-[#EDEFF2] font-['IBM_Plex_Sans',sans-serif]">
      <section class="relative overflow-hidden px-6 pt-24 pb-16 sm:px-12">
        <div
          class="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            "background-image":
              "linear-gradient(#EDEFF2 1px, transparent 1px), linear-gradient(90deg, #EDEFF2 1px, transparent 1px)",
            "background-size": "40px 40px",
          }}
        />

        <div class="relative mx-auto max-w-3xl">
          <p class="font-mono text-xs tracking-[0.2em] text-[#3E9CA8] uppercase mb-4">
            Built on Wyvern's open dataset
          </p>

          <h1 class="font-['Space_Grotesk',sans-serif] text-4xl sm:text-6xl font-medium leading-[1.05] tracking-tight">
            Hyperspectral
            <br />
            Data Viewer
          </h1>

          <p class="mt-5 max-w-lg text-[#7C8798] text-base leading-relaxed">
            A browser-based explorer for hyperspectral imagery captured by
            Wyvern's satellites
          </p>

          <div class="mt-10 mb-10">
            <div
              class="h-2 w-full rounded-sm"
              style={{
                background:
                  "linear-gradient(90deg, #6E4FA3, #3E9CA8, #6FAE5C, #E0A83E, #C4573A)",
              }}
            />
            <div class="mt-2 flex justify-between font-mono text-[10px] text-[#7C8798]">
              <For each={bands}>
                {(b) => (
                  <span class="flex flex-col items-center gap-0.5">
                    <span class="h-1.5 w-px bg-[#7C8798]/50" />
                    {b.nm}nm
                  </span>
                )}
              </For>
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <button class="rounded-md bg-[#3E9CA8] px-5 py-2.5 text-sm font-medium text-[#0A0D12] transition hover:bg-[#4FB3BF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3E9CA8]" onclick={() => navigate("/app")}>
              Launch the viewer
            </button>
            <button class="rounded-md border border-[#7C8798]/30 px-5 py-2.5 text-sm font-medium text-[#EDEFF2] font-mono transition hover:border-[#7C8798]/60 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3E9CA8]" onclick={() => window.open("https://github.com/BrennanG22/hyperspectral")}>
              &lt;/&gt; View source
            </button>
          </div>
        </div>
      </section>

      {/* About */}
      <section class="border-t border-white/5 px-6 py-16 sm:px-12">
        <div class="mx-auto max-w-3xl">
          <h2 class="font-['Space_Grotesk',sans-serif] text-2xl font-medium">
            About the project
          </h2>
          <p class="mt-3 max-w-xl text-[#7C8798] leading-relaxed">
            This project was developed to provide a simple and efficient way to quickly test indices using Wyvren open data. The application leverages GPU acceleration to rapidly process hyperspectral indices, which are applied through a built-in expression engine that allows users to define custom expressions for flexible analysis and experimentation.
          </p>
        </div>
      </section>

      {/* Data used */}
      <section class="border-t border-white/5 px-6 py-16 sm:px-12">
        <div class="mx-auto max-w-3xl">
          <p class="font-mono text-xs tracking-[0.2em] text-[#3E9CA8] uppercase mb-2">
            Source
          </p>
          <h2 class="font-['Space_Grotesk',sans-serif] text-2xl font-medium">
            What data is used
          </h2>
          <p class="mt-3 max-w-xl text-[#7C8798] leading-relaxed">
            The data used in this application is provided by Wyvern through its Open Data Program, available <a
              href="https://opendata.wyvern.space/#/?.language=en"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[#3E9CA8] underline hover:text-[#4FB3BF]"
            >
              here
            </a>.
          </p>
        </div>
      </section>

      {/* Future improvements */}
      <section class="border-t border-white/5 px-6 py-16 sm:px-12 pb-24">
        <div class="mx-auto max-w-3xl">
          <h2 class="font-['Space_Grotesk',sans-serif] text-2xl font-medium">
            Future improvements
          </h2>
          <ul class="mt-3 max-w-xl space-y-2 text-[#7C8798] leading-relaxed">
            <li>— Implementation of a custom GeoTIFF fetcher</li>
            <li>— Implementation of additional image processing piplines</li>
            <li>— Add cloud masking</li>
          </ul>
        </div>
      </section>
    </div>
  );
}


