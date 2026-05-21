import type { ValidationResult } from './diagnostics.js';

export function renderValidationHtml(result: ValidationResult, fileName: string): string {
	const title = buildTitle(result);
	const lastRun = new Date().toLocaleTimeString();
	const shortName = fileName.split(/[/\\]/).pop() ?? fileName;
	const errorHtml = result.errors.map(e => buildItem('error', e.path, e.message, e.suggestion, e.code)).join('');
	const warnHtml = result.warnings.map(w => buildItem('warning', w.path, w.message, w.suggestion)).join('');

	const bannerParts: string[] = [];
	if (result.errors.length > 0)
		bannerParts.push(`<span class="bn-errors">${result.errors.length} error${result.errors.length === 1 ? '' : 's'}</span>`);
	if (result.warnings.length > 0)
		bannerParts.push(`<span class="bn-warnings">${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}</span>`);
	if (bannerParts.length === 0)
		bannerParts.push(`<span class="bn-ok">No issues</span>`);
	bannerParts.push(`<span class="bn-meta">Last run ${esc(lastRun)}</span>`);
	const bannerHtml = bannerParts.join('<span class="bn-sep">·</span>');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Atomize Validation</title>
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 16px 18px;
    line-height: 1.5;
  }
  /* ── Header ── */
  .header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .status-icon { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; }
  .status-icon.pass { background: var(--vscode-testing-iconPassed); }
  .status-icon.fail { background: var(--vscode-testing-iconFailed); }
  h1 { font-size: 1em; font-weight: 600; margin: 0; }
  .file-path {
    padding-left: 26px;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 12px;
    cursor: default;
  }
  .file-full { display: none; word-break: break-all; }
  .file-path:hover .file-short { display: none; }
  .file-path:hover .file-full { display: inline; }
  /* ── Summary banner ── */
  .summary-banner {
    display: flex; align-items: center; flex-wrap: wrap; gap: 2px;
    padding: 2px 0;
    font-size: 0.8em;
    margin-bottom: 14px;
  }
  .bn-errors  { color: #f47474; font-weight: 600; }
  .bn-warnings { color: #cca700; font-weight: 600; }
  .bn-ok { color: var(--vscode-testing-iconPassed); font-weight: 600; }
  .bn-sep { color: var(--vscode-descriptionForeground); padding: 0 5px; }
  .bn-meta { color: var(--vscode-descriptionForeground); }
  /* ── Collapsible sections ── */
  details { margin: 0; }
  summary { cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  .section-header {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.78em; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--vscode-descriptionForeground);
    padding: 4px 0 6px;
  }
  .section-header::before {
    content: "›"; font-size: 1.15em;
    display: inline-block; width: 14px; text-align: center;
    transition: transform 0.15s;
  }
  details[open] > summary.section-header::before { transform: rotate(90deg); }
  .divider { height: 1px; background: var(--vscode-panel-border, #3d3d3d); margin: 10px 0; }
  .section-count {
    border-radius: 10px; padding: 1px 8px;
    font-size: 0.85em; font-weight: 600;
    text-transform: none; letter-spacing: 0;
    border: 1px solid transparent;
  }
  .section-count.errors {
    background: rgba(241, 76, 76, 0.12); border-color: rgba(241, 76, 76, 0.25); color: #f47474;
  }
  .section-count.warnings {
    background: rgba(204, 167, 0, 0.12); border-color: rgba(204, 167, 0, 0.25); color: #cca700;
  }
  /* ── Issue items ── */
  .issue-group { margin-bottom: 10px; }
  .item {
    display: flex; align-items: flex-start; gap: 8px;
    border-radius: 4px;
    border-left: 2px solid transparent;
  }
  .item.error {
    padding: 6px 8px;
    background: rgba(241, 76, 76, 0.06);
    border-left-color: rgba(241, 76, 76, 0.4);
  }
  .item.warning {
    padding: 5px 8px;
    background: rgba(204, 167, 0, 0.04);
    border-left-color: rgba(204, 167, 0, 0.3);
  }
  .item-body { flex: 1; min-width: 0; }
  .issue-suggestion { padding: 4px 0 0 10px; }
  .item-title-row {
    display: flex; align-items: baseline; gap: 7px;
    flex-wrap: wrap; margin-bottom: 1px;
  }
  .item-title { font-size: 0.88em; font-weight: 600; }
  .item-path {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.75em;
    color: #e0e0e0;
    background: rgba(255, 255, 255, 0.09);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    padding: 0 5px;
  }
  .item-message {
    font-size: 0.84em;
    color: var(--vscode-descriptionForeground);
    word-break: break-word; overflow-wrap: break-word;
    margin-top: 1px;
  }
  /* ── Inline code tokens ── */
  code {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.9em;
    color: #e0e0e0;
    background: rgba(255, 255, 255, 0.09);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    padding: 0 4px;
    margin: 0 3px;
  }
  /* ── Suggestion toggle ── */
  .item-summary {
    display: inline-flex; align-items: center; line-height: 1;
    font-size: 0.76em; font-weight: 600;
    color: var(--vscode-descriptionForeground);
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.11);
    border-radius: 3px;
    padding: 2px 8px 2px 2px;
    gap: 2px;
  }
  .item-summary::before {
    content: "›"; font-size: 1.1em; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    width: 16px; height: 16px;
    transition: transform 0.15s;
  }
  details[open] > summary.item-summary::before { transform: rotate(90deg); }
  .item-suggestion {
    margin-top: 5px; font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
    padding: 6px 10px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 4px;
    word-break: break-word; overflow-wrap: break-word;
  }
</style>
</head>
<body>
<div class="header">
  <div class="status-icon ${result.valid ? 'pass' : 'fail'}"></div>
  <h1>${esc(title)}</h1>
</div>
<div class="file-path"><span class="file-short">${esc(shortName)}</span><span class="file-full">${esc(fileName)}</span></div>
<div class="summary-banner">${bannerHtml}</div>
${result.errors.length > 0 ? `
<div class="divider"></div>
<details open><summary class="section-header">Errors <span class="section-count errors">${result.errors.length}</span></summary>
<div class="errors">${errorHtml}</div></details>` : ''}
${result.warnings.length > 0 ? `
<div class="divider"></div>
<details open><summary class="section-header">Warnings <span class="section-count warnings">${result.warnings.length}</span></summary>
<div class="warnings">${warnHtml}</div></details>` : ''}
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

	const pathHtml = path ? `<span class="item-path">${esc(path)}</span>` : '';
	const suggestionHtml = suggestion
		? `<div class="issue-suggestion"><details><summary class="item-summary">Suggested fix</summary><div class="item-suggestion">${highlight(esc(suggestion))}</div></details></div>`
		: '';

	return `<div class="issue-group"><div class="item ${type}">
  <div class="item-body">
    <div class="item-title-row"><span class="item-title">${esc(titleText)}</span>${pathHtml}</div>
    ${bodyText ? `<div class="item-message">${bodyText}</div>` : ''}
  </div>
</div>${suggestionHtml}</div>`;
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
		.replace(/&quot;([^&]*)&quot;/g, '<code>$1</code>')
		.replace(/&lt;([\w][\w-]*)&gt;/g, '<code>&lt;$1&gt;</code>')
		.replace(/(--[\w-]+)/g, '<code>$1</code>')
		.replace(/<\/code>,\s*<code>/g, '</code> <code>');
}

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
