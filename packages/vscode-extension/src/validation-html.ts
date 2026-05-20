import type { ValidationResult } from './diagnostics.js';

export function renderValidationHtml(result: ValidationResult, fileName: string): string {
	const title = buildTitle(result);
	const summary = buildSummary(result);
	const lastRun = new Date().toLocaleTimeString();
	const errorHtml = result.errors.map(e => buildItem('error', e.path, e.message, e.suggestion)).join('');
	const warnHtml = result.warnings.map(w => buildItem('warning', w.path, w.message, w.suggestion)).join('');

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
    padding: 16px;
    line-height: 1.5;
  }
  h1 { font-size: 1.1em; margin: 0 0 4px; }
  .file { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-bottom: 12px; }
  .last-run { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-bottom: 12px; }
  .summary { margin-bottom: 16px; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .section-title { font-weight: bold; font-size: 0.9em; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.05em; }
  .item { padding: 8px 10px; margin-bottom: 6px; border-radius: 3px; border-left: 3px solid; }
  .item.error { background: var(--vscode-inputValidation-errorBackground); border-color: var(--vscode-inputValidation-errorBorder); }
  .item.warning { background: var(--vscode-inputValidation-warningBackground); border-color: var(--vscode-inputValidation-warningBorder); }
  .item-path { font-family: var(--vscode-editor-font-family); font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 2px; }
  .item-message { font-size: 0.9em; }
  .item-suggestion { margin-top: 4px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
  .valid-banner { color: var(--vscode-testing-iconPassed); font-weight: bold; }
  .invalid-banner { color: var(--vscode-testing-iconFailed); font-weight: bold; }
</style>
</head>
<body>
<h1 class="${result.valid ? 'valid-banner' : 'invalid-banner'}">${esc(title)}</h1>
<div class="file">${esc(fileName)}</div>
<div class="last-run">Last run: ${esc(lastRun)}</div>
<div class="summary">${esc(summary)}</div>
${result.errors.length > 0 ? `<div class="section-title">Errors</div><div class="errors">${errorHtml}</div>` : ''}
${result.warnings.length > 0 ? `<div class="section-title">Warnings</div><div class="warnings">${warnHtml}</div>` : ''}
</body>
</html>`;
}

function buildTitle(result: ValidationResult): string {
	if (result.valid) return '✓ Valid';
	if (result.errors.length === 0 && result.warnings.length > 0) return '✗ Strict Validation Failed';
	return '✗ Validation Failed';
}

function buildSummary(result: ValidationResult): string {
	const parts: string[] = [];
	if (result.errors.length > 0) parts.push(`${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`);
	if (result.warnings.length > 0) parts.push(`${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`);
	if (parts.length === 0) parts.push('No issues found');
	return `${parts.join(', ')} · ${result.mode} mode`;
}

function buildItem(type: 'error' | 'warning', path: string, message: string, suggestion?: string): string {
	const pathHtml = path ? `<div class="item-path">${esc(path)}</div>` : '';
	const suggestionHtml = suggestion ? `<div class="item-suggestion">Suggestion: ${esc(suggestion)}</div>` : '';
	return `<div class="item ${type}">${pathHtml}<div class="item-message">${esc(message)}</div>${suggestionHtml}</div>`;
}

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
