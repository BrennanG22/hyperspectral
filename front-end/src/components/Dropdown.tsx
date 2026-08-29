import { createSignal, createEffect, onCleanup, For, Show } from 'solid-js';

export interface DropdownOption {
  label: string;
  value: string;
}

interface DropdownProps {
  options: DropdownOption[] | string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

function normalize(options: DropdownOption[] | string[]): DropdownOption[] {
  return options.map((o) =>
    typeof o === 'string' ? { label: o, value: o } : o
  );
}

export default function Dropdown(props: DropdownProps) {
  const [open, setOpen] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;
  const options = () => normalize(props.options);
  const selected = () => options().find((o) => o.value === props.value);

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setOpen(false);
    }
  };

  createEffect(() => {
    if (open()) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
  });
  onCleanup(() => document.removeEventListener('mousedown', handleClickOutside));

  createEffect(() => {
    if (props.disabled && open()) {
      setOpen(false);
    }
  });

  return (
    <div
      class="relative w-full"
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => {
          if (!props.disabled) setOpen((v) => !v);
        }}
        class="w-full flex items-center justify-between bg-[#12161c] border border-[#232830]
               text-sm rounded-lg px-3 py-2.5 outline-none transition-colors
               hover:border-[#2f3742]"
        classList={{
          '!border-[#4a90ff]': open() && !props.disabled && !props.error,
          'opacity-50 cursor-not-allowed hover:!border-[#232830]': props.disabled,
          '!border-[#e05252] hover:!border-[#e05252]': !!props.error && !props.disabled,
        }}
      >
        <span class={selected() ? 'text-[#e7eaee]' : 'text-[#5b6472]'}>
          {selected()?.label ?? props.placeholder ?? 'Select...'}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          class="ml-2 shrink-0 text-[#5b6472] transition-transform duration-150"
          classList={{ 'rotate-180 !text-[#4a90ff]': open() && !props.disabled && !props.error }}
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.4"
                stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <Show when={props.error && hovered() && !open()}>
        <div
          class="absolute z-30 bottom-full mb-1.5 left-0 max-w-xs
                 bg-[#2a1416] border border-[#e05252]/40 text-[#ff8080]
                 text-xs rounded-md px-2.5 py-1.5 shadow-lg shadow-black/40
                 whitespace-normal"
          role="tooltip"
        >
          {props.error}
        </div>
      </Show>

      <Show when={open() && !props.disabled}>
        <div
          class="absolute z-20 mt-1.5 w-full max-h-60 overflow-y-auto
                 bg-[#12161c] border border-[#232830] rounded-lg shadow-lg shadow-black/40
                 py-1"
        >
          <Show
            when={options().length > 0}
            fallback={
              <div class="px-3 py-2 text-xs text-[#5b6472]">No options</div>
            }
          >
            <For each={options()}>
              {(option) => (
                <button
                  type="button"
                  onClick={() => {
                    props.onChange(option.value);
                    setOpen(false);
                  }}
                  class="w-full text-left px-3 py-2 text-sm transition-colors
                         hover:bg-[#1a1f27]"
                  classList={{
                    'text-[#4a90ff] bg-[#161b23]': option.value === props.value,
                    'text-[#e7eaee]': option.value !== props.value,
                  }}
                >
                  {option.label}
                </button>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
