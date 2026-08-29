import { createSignal, Match, Switch, type JSX } from "solid-js";
import TiffImageWrapper from "./tiff/TiffImageWrapper";
import Dropdown from "./components/Dropdown";
import { onMount, createMemo } from "solid-js";
import { getCollections } from "./tiff/urlHelper";
import type { LoadedTiffMetaData, ProcessingInput, ProcessingInputModes } from "./tiff/TiffImageManager";
import BandTable from "./components/BandTable";

type StepStatus = "locked" | "active" | "complete";

export default function HyperspectralApp() {
  const [reloadTrigger, setReloadTrigger] = createSignal(0);

  const [collections, setCollections] = createSignal<string[]>([]);
  const [selectedCollection, setSelectedCollection] = createSignal("");

  const [loadedTiffMetaData, setLoadedTiffMetaData] = createSignal<LoadedTiffMetaData | null>(null);

  const [selectedQualityOption, setSelectedQualityOption] = createSignal<string>("");

  const [selectedProcessingMode, setSelectedProcessingMode] = createSignal<ProcessingInputModes | null>(null);
  const PROCESSING_MODE_MAP: Record<ProcessingInputModes, string> = {
    "RGB": "RGB (Multi Channel Multi Expression)",
    "SC": "SC (Single Channel Single Expression)"
  }
  const PROCESSING_MODES = ["RGB (Multi Channel Multi Expression)", "SC (Single Channel Single Expression)"];

  const [scExpression, setSCExpression] = createSignal("");

  const [redExpression, setRedExpression] = createSignal("");
  const [greenExpression, setGreenExpression] = createSignal("");
  const [blueExpression, setBlueExpression] = createSignal("");

  const qualityOption = createMemo(() => {
    if (selectedQualityOption() === "") {
      if (loadedTiffMetaData() != null) {
        for (const res in loadedTiffMetaData()!.dimensions) {
          if (loadedTiffMetaData()!.dimensions[res].height < window.screen.height && (Number(res) != 0)) {
            return Number(res) - 1;
          }
        }
      }
      return 0;
    }
    return qualityOptions().findIndex((option) => option === selectedQualityOption());
  })

  const renderData = createMemo(() => {
    switch (selectedProcessingMode()) {
      case "RGB":
        return ({
          mode: "RGB", data: {
            region: [0, 0, 0, 0], //Region will be set in the Image Wrapper
            qualityLevel: qualityOption(),
            redExpression: redExpression(),
            greenExpression: greenExpression(),
            blueExpression: blueExpression()
          }
        } as ProcessingInput)
      case "SC":
        return ({
          mode: "SC", data: {
            region: [0, 0, 0, 0], //Region will be set in the Image Wrapper
            qualityLevel: qualityOption(),
            expression: scExpression()
          }
        } as ProcessingInput)
    }

  })

  const qualityOptions = createMemo(() => {
    if (!loadedTiffMetaData()) {
      return []
    }
    return loadedTiffMetaData()!.qualityLevels
  })

  const canSubmit = createMemo(() => {
    const collectionSelected = selectedCollection();
    const expressionSet = scExpression() || (redExpression() && greenExpression() && blueExpression());
    return (collectionSelected && expressionSet);
  })

  const dataStatus = createMemo<StepStatus>(() =>
    selectedCollection() ? "complete" : "active"
  );

  const processingStatus = createMemo<StepStatus>(() => {
    if (!selectedCollection()) return "locked";
    return selectedProcessingMode() ? "complete" : "active";
  });

  const expressionStatus = createMemo<StepStatus>(() => {
    if (!selectedProcessingMode()) return "locked";
    return canSubmit() ? "complete" : "active";
  });

  const runStatus = createMemo<StepStatus>(() =>
    canSubmit() ? "active" : "locked"
  );

  onMount(async () => {
    setCollections(await getCollections())
  })

  function setCollectionWithClear(collectionID: string) {
    setSelectedQualityOption("");
    setSelectedCollection(collectionID);
  }

  return (
    <div class="w-screen h-screen overflow-hidden flex bg-[#080b10] text-[#e7eaee]">
      <main class="flex-1 min-w-0 overflow-hidden">
        <TiffImageWrapper
          collectionID={selectedCollection()}
          reloadTrigger={reloadTrigger()}
          renderData={renderData()}
          metaDataSetter={setLoadedTiffMetaData}
        />
      </main>
      <aside class="shrink-0 border-l border-gray-200 min-w-[500px] p-4 flex flex-col overflow-y-scroll">

        <header class="border-b border-[#1c2128] px-6 py-6">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[10px] font-medium uppercase tracking-[0.2em] text-[#4a90ff]">
                Spectral Analysis
              </p>
              <h1 class="mt-1 text-base font-medium tracking-tight text-[#f4f6f8]">
                Configure imagery
              </h1>
            </div>
          </div>
        </header>

        <div class="flex flex-1 flex-col px-6">

          <StepSection
            status={dataStatus()}
            isLast={false}
            number="01"
            title="Data"
            description="Select imagery and output resolution"
          >
            <div class="flex flex-col gap-4">

              <Field label="Collection">
                <Dropdown
                  options={collections()}
                  value={selectedCollection()}
                  onChange={setCollectionWithClear}
                  placeholder={'Choose a collection'}
                />
              </Field>

              <Field label="OPTIONAL: Output resolution">
                <Dropdown
                  options={qualityOptions()}
                  value={selectedQualityOption()}
                  onChange={(v) => {
                    setSelectedQualityOption(v)
                  }}
                  placeholder={`Select... ${selectedCollection() == ""? "" : `(Default: ${qualityOptions()[qualityOption()]})`}`}
                  disabled={selectedCollection() == ""}
                />

                <p class="mt-2 text-sm text-gray-500">
                  Higher resolutions may require longer processing times.
                </p>
              </Field>

              <p class="text-sm text-gray-500">
                Tip: Hold <kbd class="rounded border px-1.5 py-0.5 text-xs">Shift</kbd> and drag on the image to select a<br/> specific area of the image to process.
              </p>

            </div>
          </StepSection>

          <StepSection
            status={processingStatus()}
            isLast={false}
            number="02"
            title="Processing"
            description="Choose how the imagery is interpreted"
          >
            <Field label="Processing mode">
              <Dropdown
                options={PROCESSING_MODES}
                value={selectedProcessingMode() == null ? "" : PROCESSING_MODE_MAP[selectedProcessingMode()!]}
                onChange={(v) => {
                  const mode = Object.entries(PROCESSING_MODE_MAP)
                    .find(([, label]) => label === v)?.[0];

                  setSelectedProcessingMode(mode as ProcessingInputModes | null);
                }}
                placeholder="Choose a processing mode"
                disabled={selectedCollection() == ""}
              />
            </Field>
          </StepSection>

          <StepSection
            status={expressionStatus()}
            isLast={true}
            number="03"
            title="Expression"
            description="Define an index expression"
            helpText={
              <>
                <p>
                  Define the expression used to calculate the value for each pixel.
                  Expressions can reference image bands (b0, b1, b2, etc) or mathematical operators ( +, -, *, /, ^, () ).
                </p>

                <p>
                  For single-channel processing, the expression determines the index
                  value. For RGB processing, provide a separate expression for the
                  red, green, and blue channels.
                </p>

                <p>
                  Make sure your expression is valid before running the analysis.
                  <Switch>
                    <Match when={selectedProcessingMode() == "SC"}>
                      <span>
                        {" "}Click{" "}
                        <button
                          type="button"
                          class="text-[#4a90ff] underline underline-offset-2 hover:text-[#7aaeff]"
                          onClick={() => {
                            setSCExpression("(b22 - b11) / (b22 + b11)");
                          }}
                        >
                          here
                        </button>{" "}
                        to load an example NDVI expression into the equation box.
                      </span>
                    </Match>
                    <Match when={selectedProcessingMode() == "RGB"}>
                      <span>
                        {" "}Click{" "}
                        <button
                          type="button"
                          class="text-[#4a90ff] underline underline-offset-2 hover:text-[#7aaeff]"
                          onClick={() => {
                            setRedExpression("b22");
                            setGreenExpression("b7");
                            setBlueExpression("b0")
                          }}
                        >
                          here
                        </button>{" "}
                        to load an inferad exagerated expression into the equation box.
                      </span>
                    </Match>
                  </Switch>
                </p>
              </>
            }
          >
            {loadedTiffMetaData() && (
              <div class="mt-2 border-t border-[#1c2128] pt-4 pb-4">
                <p class="text-[10px] font-medium uppercase tracking-[0.13em] text-[#697382]">
                  Bands
                </p>
                <p class="mt-1 text-[10px] leading-relaxed text-[#535d6a]">
                  Reference wavelengths, FWHM, and names for each band index
                </p>
                <div class="mt-3">
                  <BandTable bandData={loadedTiffMetaData()!.bandData} />
                </div>
              </div>
            )}
            <Switch>

              <Match when={selectedProcessingMode() === "SC"}>
                <ExpressionInput
                  label="Index"
                  value={scExpression()}
                  onInput={setSCExpression}
                  placeholder="eg. (b22-b11) / (b22+b11)"
                // error={expressionError(expressionValue())}
                />
              </Match>

              <Match when={selectedProcessingMode() === "RGB"}>
                <div class="flex flex-col gap-3">
                  <ExpressionInput
                    label="Red"
                    color="#e56b6f"
                    value={redExpression()}
                    onInput={setRedExpression}
                    placeholder="eg. b22"
                  // error={expressionError(redExpressionValue())}
                  />
                  <ExpressionInput
                    label="Green"
                    color="#61bf7a"
                    value={greenExpression()}
                    onInput={setGreenExpression}
                    placeholder="eg. b11"
                  // error={expressionError(greenExpressionValue())}
                  />
                  <ExpressionInput
                    label="Blue"
                    color="#5e8fff"
                    value={blueExpression()}
                    onInput={setBlueExpression}
                    placeholder="eg. b0"
                  // error={expressionError(blueExpressionValue())}
                  />
                </div>
              </Match>

              <Match when={!selectedProcessingMode()}>
                <div class="rounded-lg border border-dashed border-[#232830] px-4 py-5 text-center">
                  <p class="text-xs text-[#596371]">
                    Select a processing mode above
                  </p>
                </div>
              </Match>

            </Switch>
          </StepSection>

        </div>

        <section
          class="border-t border-[#1c2128] bg-[#090c11] px-6 py-5 transition-opacity"
          classList={{ "opacity-40": runStatus() === "locked" }}
        >
          <SectionHeader
            number="04"
            title="Run"
            description="Process the selected imagery"
            status={runStatus()}
          />

          <button
            class="
              mt-4 flex w-full items-center justify-center gap-2
              rounded-lg bg-[#2f6bff] py-3 text-sm font-medium text-white
              shadow-[0_0_20px_rgba(47,107,255,0.08)]
              transition-all hover:bg-[#3b75ff] hover:shadow-[0_0_24px_rgba(47,107,255,0.15)]
              active:scale-[0.99] active:bg-[#255de0]
              disabled:cursor-not-allowed disabled:opacity-50
            "
            disabled={!canSubmit()}
            onclick={() => setReloadTrigger((prev) => { return prev + 1 })}
          >
            <span>Run analysis</span>
          </button>

          <p class="mt-2 text-center text-[9px] uppercase tracking-[0.12em] text-[#454e5b]">
            Processing may take several seconds
          </p>
        </section>
      </aside>
    </div>)
}

function StepSection(props: {
  status: StepStatus;
  isLast: boolean;
  number: string;
  title: string;
  description: string;
  helpText?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <section
      class="border-b border-[#1c2128] py-6 transition-opacity"
      classList={{ "opacity-40 pointer-events-none": props.status === "locked" }}
    >
      <div class="grid grid-cols-[18px_1fr] gap-x-3">

        {/* Gutter: dot + connector line, isolated from content */}
        <div class="relative flex justify-center">
          <span
            class="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-mono text-[9px] transition-colors"
            classList={{
              "bg-[#2f6bff] text-white": props.status === "active",
              "bg-[#1c5c33] text-[#7ee2a0]": props.status === "complete",
              "border border-[#2a3039] text-[#4b5563] bg-[#080b10]": props.status === "locked",
            }}
          >
            {props.status === "complete" ? "✓" : props.number}
          </span>

          {!props.isLast && (
            <span
              aria-hidden="true"
              class="absolute left-1/2 top-[20px] bottom-[-24px] w-px -translate-x-1/2"
              classList={{
                "bg-[#1c5c33]": props.status === "complete",
                "bg-[#232830]": props.status !== "complete",
              }}
            />
          )}
        </div>

        {/* Content: title, description/help, and step body */}
        <div>
          <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-[#d5dae1]">
            {props.title}
          </h2>

          {props.helpText ? (
            <div class="group relative mt-1.5 inline-block">
              <p class="text-[10px] leading-relaxed text-[#535d6a]">
                {props.description}
              </p>

              <span
                class="
                  mt-1.5 inline-flex cursor-help items-center gap-1.5
                  rounded-full border border-[#2a3f6b] bg-[#132038] px-2.5 py-1
                  text-[9px] font-medium uppercase tracking-[0.08em] text-[#7aaeff]
                  transition-colors
                  group-hover:border-[#4a90ff] group-hover:bg-[#1a2c4d] group-hover:text-[#a8c8ff]
                "
              >
                <span
                  aria-hidden="true"
                  class="
                    flex h-3 w-3 shrink-0 items-center justify-center rounded-full
                    border border-current text-[8px] leading-none
                  "
                >
                  ?
                </span>
                Hover for help
              </span>

              <div
                class="
    absolute left-0 top-[calc(100%+6px)] z-50
    w-80
    rounded-lg border border-[#2a3039]
    bg-[#0d1117]
    p-4
    shadow-[0_16px_40px_rgba(0,0,0,0.5)]
    opacity-0
    translate-y-1
    invisible
    transition-all duration-150

    group-hover:visible
    group-hover:translate-y-0
    group-hover:opacity-100
  "
              >
                <div class="mb-2 flex items-center gap-2">
                  <span class="h-1.5 w-1.5 rounded-full bg-[#4a90ff]" />
                  <span class="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#697382]">
                    Expression help
                  </span>
                </div>

                <div class="space-y-3 text-[11px] leading-relaxed text-[#8d98a7]">
                  {props.helpText}
                </div>
              </div>
            </div>
          ) : (
            <p class="mt-1 text-[10px] leading-relaxed text-[#535d6a]">
              {props.description}
            </p>
          )}

          <div class="mt-5">
            {props.children}
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeader(props: {
  number: string;
  title: string;
  description: string;
  status: StepStatus;
  helpText?: JSX.Element;
}) {
  return (
    <div class="relative flex items-start gap-3">
      <span
        class="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-mono text-[9px] transition-colors"
        classList={{
          "bg-[#2f6bff] text-white": props.status === "active",
          "bg-[#1c5c33] text-[#7ee2a0]": props.status === "complete",
          "border border-[#2a3039] text-[#4b5563] bg-[#080b10]": props.status === "locked",
        }}
      >
        {props.status === "complete" ? "✓" : props.number}
      </span>

      <div>
        <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-[#d5dae1]">
          {props.title}
        </h2>

        {props.helpText ? (
          <div class="group relative mt-1">
            <p class="inline-block cursor-help text-[10px] leading-relaxed text-[#535d6a] transition-colors group-hover:text-[#8b96a5]">
              {props.description}
            </p>

            {/* Help popup */}

            <div
              class="
    absolute left-0 top-full z-50 mt-2
    w-80
    rounded-lg border border-[#2a3039]
    bg-[#0d1117]
    p-4
    shadow-[0_16px_40px_rgba(0,0,0,0.5)]
    opacity-0
    translate-y-1
    invisible
    transition-all duration-150

    group-hover:visible
    group-hover:translate-y-0
    group-hover:opacity-100
  "
            >

              <div class="mb-2 flex items-center gap-2">
                <span class="h-1.5 w-1.5 rounded-full bg-[#4a90ff]" />

                <span class="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#697382]">
                  Expression help
                </span>
              </div>

              <div class="space-y-3 text-[11px] leading-relaxed text-[#8d98a7]">
                {props.helpText}
              </div>
            </div>
          </div>
        ) : (
          <p class="mt-1 text-[10px] leading-relaxed text-[#535d6a]">
            {props.description}
          </p>
        )}
      </div>
    </div>
  );
}


function Field(props: {
  label: string;
  children: JSX.Element;
}) {
  return (
    <div class="flex flex-col gap-1.5">
      <label class="text-[10px] font-medium uppercase tracking-[0.13em] text-[#697382]">
        {props.label}
      </label>
      {props.children}
    </div>
  );
}

function InlineError(props: { message: string }) {
  return (
    <p class="rounded-md border border-[#3a2226] bg-[#1a0f11] px-2.5 py-1.5 text-[10px] text-[#e5878c]">
      {props.message}
    </p>
  );
}

function ExpressionInput(props: {
  label: string;
  value: string;
  onInput: (value: string) => void;
  placeholder?: string,
  color?: string;
  error?: string | null;
}) {
  return (
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-2">
        {props.color && (
          <span
            class="h-1.5 w-1.5 rounded-full"
            style={{ 'background-color': props.color }}
          />
        )}
        <label class="text-[10px] font-medium uppercase tracking-[0.13em] text-[#697382]">
          {props.label}
        </label>
      </div>

      <input
        class={`
          w-full rounded-lg border bg-[#0d1117] px-3 py-2.5
          font-mono text-xs text-[#aeb8c6] outline-none transition-colors
          placeholder:text-[#454e5b]
          ${props.error
            ? 'border-[#5c2a2e] focus:border-[#c94b52]'
            : 'border-[#232830] hover:border-[#303742] focus:border-[#4a90ff]'
          }
          focus:bg-[#0f141b]
        `}
        value={props.value}
        placeholder={props.placeholder}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        spellcheck={false}
        autocomplete="off"
      />

      {props.error && <InlineError message={props.error} />}
    </div>
  );
}
