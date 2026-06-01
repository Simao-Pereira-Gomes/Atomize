import css from '../webview/styles.generated.css';
import type { ValidationResult } from './diagnostics.js';

const CODE_CLS = 'font-mono text-[0.9em] text-[#e0e0e0] bg-white/[0.09] border border-white/[0.12] rounded-[3px] px-1 mx-[3px]';

export function renderValidationHtml(result: ValidationResult, fileName: string): string {
	const title = buildTitle(result);
	const lastRun = new Date().toLocaleTimeString();
	const shortName = fileName.split(/[/\\]/).pop() ?? fileName;
	const errorHtml = result.errors.map(e => buildItem('error', e.path, e.message, e.suggestion, e.code)).join('');
	const warnHtml = result.warnings.map(w => buildItem('warning', w.path, w.message, w.suggestion)).join('');

	const bannerParts: string[] = [];
	if (result.errors.length > 0)
		bannerParts.push(`<span class="font-semibold text-[#f47474]">${result.errors.length} error${result.errors.length === 1 ? '' : 's'}</span>`);
	if (result.warnings.length > 0)
		bannerParts.push(`<span class="font-semibold text-[#cca700]">${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}</span>`);
	if (bannerParts.length === 0)
		bannerParts.push(`<span class="font-semibold text-pass">No issues</span>`);
	bannerParts.push(`<span class="text-desc">Last run ${esc(lastRun)}</span>`);
	const bannerHtml = bannerParts.join('<span class="text-desc px-[5px]">·</span>');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Atomize Validation</title>
<style>
  ${css}
  body { color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  code { font-family: var(--vscode-editor-font-family); }
  summary { list-style: none; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }
</style>
</head>
<body class="m-0 px-[18px] py-4 leading-relaxed">

<div class="flex items-center gap-2.5 mb-1">
  <div class="w-4 h-4 rounded-full shrink-0 ${result.valid ? 'bg-pass' : 'bg-fail'}"></div>
  <h1 class="text-[1em] font-semibold m-0">${esc(title)}</h1>
</div>
<div class="group pl-[26px] font-mono text-[0.8em] text-desc mb-3 cursor-default">
  <span class="group-hover:hidden">${esc(shortName)}</span>
  <span class="hidden group-hover:inline break-all">${esc(fileName)}</span>
</div>

<div class="flex flex-wrap items-center gap-0.5 text-[0.8em] mb-[14px]">${bannerHtml}</div>

${result.errors.length > 0 ? `
<hr class="border-t border-[var(--vscode-panel-border,#3d3d3d)] my-2.5">
<details open class="group/sec">
  <summary class="flex items-center gap-1.5 text-[0.78em] font-bold uppercase tracking-[0.08em] text-desc py-1 pb-1.5">
    <span class="inline-block w-3.5 text-center transition-transform duration-150 group-open/sec:rotate-90">›</span>
    Errors
    <span class="rounded-[10px] px-2 py-px text-[0.85em] font-semibold normal-case tracking-normal bg-red-500/10 border border-red-500/25 text-[#f47474]">${result.errors.length}</span>
  </summary>
  <div>${errorHtml}</div>
</details>` : ''}

${result.warnings.length > 0 ? `
<hr class="border-t border-[var(--vscode-panel-border,#3d3d3d)] my-2.5">
<details open class="group/sec">
  <summary class="flex items-center gap-1.5 text-[0.78em] font-bold uppercase tracking-[0.08em] text-desc py-1 pb-1.5">
    <span class="inline-block w-3.5 text-center transition-transform duration-150 group-open/sec:rotate-90">›</span>
    Warnings
    <span class="rounded-[10px] px-2 py-px text-[0.85em] font-semibold normal-case tracking-normal bg-yellow-500/10 border border-yellow-500/25 text-[#cca700]">${result.warnings.length}</span>
  </summary>
  <div>${warnHtml}</div>
</details>` : ''}

</body>
</html>`;
}

function buildTitle(result: ValidationResult): string {
	if (result.valid) return 'Valid';
	if (result.errors.length === 0 && result.warnings.length > 0) return 'Strict Validation Failed';
	return 'Validation Failed';
}

function buildItem(type: 'error' | 'warning', path: string, message: string, suggestion?: string, code?: string): string {
	let titleText: string;
	let bodyText: string;
	if (code) {
		titleText = codeToTitle(code);
		bodyText = highlight(esc(message));
	} else {
		const [first, rest] = splitAtSentence(message);
		titleText = first;
		bodyText = rest ? highlight(esc(rest)) : '';
	}

	const itemCls = type === 'error'
		? 'p-[6px_8px] bg-red-500/[0.06] border-l-red-500/40'
		: 'p-[5px_8px] bg-yellow-500/[0.04] border-l-yellow-500/30';

	const pathHtml = path
		? `<span class="font-mono text-[0.75em] text-[#e0e0e0] bg-white/[0.09] border border-white/[0.12] rounded-[3px] px-[5px]">${esc(path)}</span>`
		: '';

	const suggestionHtml = suggestion
		? `<div class="pl-2.5 pt-1"><details class="group/sug"><summary class="inline-flex items-center gap-0.5 text-[0.76em] font-semibold text-desc bg-white/[0.07] border border-white/[0.11] rounded-[3px] px-2 py-0.5 leading-none"><span class="inline-block w-4 text-center transition-transform duration-150 group-open/sug:rotate-90">›</span>Suggested fix</summary><div class="mt-[5px] text-[0.82em] text-desc p-[6px_10px_10px] bg-white/[0.04] border border-white/[0.07] rounded break-words">${highlight(esc(suggestion))}</div></details></div>`
		: '';

	return `<div class="mb-2.5">
  <div class="flex items-start rounded border-l-2 ${itemCls}">
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline gap-[7px] flex-wrap mb-px">
        <span class="text-[0.88em] font-semibold">${esc(titleText)}</span>${pathHtml}
      </div>
      ${bodyText ? `<div class="text-[0.84em] text-desc break-words mt-px">${bodyText}</div>` : ''}
    </div>
  </div>${suggestionHtml}
</div>`;
}

function splitAtSentence(message: string): [string, string] {
	const idx = message.indexOf('. ');
	if (idx === -1) return [message, ''];
	return [message.slice(0, idx), message.slice(idx + 2)];
}

function codeToTitle(code: string): string {
	return code
		.split('_')
		.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(' ');
}

function highlight(escaped: string): string {
	return escaped
		.replace(/&quot;([^&]*)&quot;/g, `<code class="${CODE_CLS}">$1</code>`)
		.replace(/&lt;([\w][\w-]*)&gt;/g, `<code class="${CODE_CLS}">&lt;$1&gt;</code>`)
		.replace(/(--[\w-]+)/g, `<code class="${CODE_CLS}">$1</code>`)
		.replace(/<\/code>,\s*<code[^>]*>/g, `</code> <code class="${CODE_CLS}">`);
}

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
