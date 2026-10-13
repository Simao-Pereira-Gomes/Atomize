import { createSignal, onCleanup, onMount, Show } from "solid-js";

export function ThemeToggle() {
	const [dark, setDark] = createSignal(false);
	let followSystem = true;

	function applyTheme(isDark: boolean) {
		setDark(isDark);
		document.documentElement.dataset.theme = isDark ? "dark" : "light";
		document.documentElement.style.colorScheme = isDark ? "dark" : "light";
	}

	onMount(() => {
		setDark(document.documentElement.dataset.theme === "dark");
		try {
			followSystem = !localStorage.getItem("atomize-theme");
		} catch {
			/* Keep the system preference when storage is unavailable. */
		}
		const preference = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = (event: MediaQueryListEvent) => {
			if (followSystem) applyTheme(event.matches);
		};
		preference.addEventListener("change", handleChange);
		onCleanup(() => preference.removeEventListener("change", handleChange));
	});

	function toggle() {
		followSystem = false;
		applyTheme(!dark());
		try {
			localStorage.setItem("atomize-theme", dark() ? "dark" : "light");
		} catch {
			/* The toggle still works for this session. */
		}
	}

	return (
		<button
			class="theme-toggle"
			type="button"
			onClick={toggle}
			aria-label={dark() ? "Switch to light mode" : "Switch to dark mode"}
			title={dark() ? "Switch to light mode" : "Switch to dark mode"}
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<Show
					when={dark()}
					fallback={
						<>
							<circle cx="12" cy="12" r="4" />
							<path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
						</>
					}
				>
					<path d="M20.5 14a8.6 8.6 0 0 1-10.5-10.5A8.7 8.7 0 1 0 20.5 14Z" />
				</Show>
			</svg>
			<span>{dark() ? "Dark" : "Light"}</span>
		</button>
	);
}
