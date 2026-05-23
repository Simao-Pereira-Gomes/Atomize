import css from './webview/styles.generated.css';

// ─── Types matching CLI AtomizationReport JSON output ─────────────────────────

export interface LivePreviewTask {
	title: string;
	estimation?: number;
	estimationPercent?: number;
	tags?: string[];
	priority?: number;
	dependsOn?: string[];
}

export interface LivePreviewStory {
	id: string;
	title: string;
	url?: string;
	estimation?: number;
}

export interface LivePreviewResult {
	story: LivePreviewStory;
	tasksCalculated: LivePreviewTask[];
	tasksSkipped?: Array<{ templateTask: { title: string }; reason: string }>;
	success: boolean;
	error?: string;
	estimationSummary?: {
		storyEstimation: number;
		totalTaskEstimation: number;
		percentageUsed: number;
	};
}

export interface AtomizationReport {
	results: LivePreviewResult[];
	storiesFailed: number;
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

function esc(s: unknown): string {
	return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pctColor(pct: number): string {
	if (pct > 100) return 'var(--vscode-notificationsErrorIcon-foreground)';
	if (pct > 80) return '#cca700';
	return 'var(--vscode-testing-iconPassed)';
}

function fmtPct(pct: number): string {
	return pct.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const SHARED_CSS = `${css}
body{color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);margin:0;padding:0 18px 24px;line-height:1.625}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:6px 14px;border-radius:2px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.btn-primary:hover:not(:disabled){background:var(--vscode-button-hoverBackground)}
.btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:6px 14px;border-radius:2px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);cursor:pointer}
.btn-secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
.tag{display:inline-block;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:0 5px;font-size:.75em;color:var(--vscode-descriptionForeground);line-height:1.6}
.est-track{background:rgba(255,255,255,.08);border-radius:3px;height:4px;overflow:hidden}
.est-fill{height:100%;border-radius:3px}
.view-toggle{display:inline-flex;align-items:center;gap:12px;flex-shrink:0;margin-top:1px}
.view-toggle__option{appearance:none;position:relative;border:0;background:transparent;color:var(--vscode-descriptionForeground);opacity:.58;font-family:var(--vscode-font-family);font-size:.78em;font-weight:500;line-height:1;padding:3px 0 7px;cursor:pointer}
.view-toggle__option:hover{opacity:.86;color:var(--vscode-editor-foreground)}
.view-toggle__option[aria-selected="true"]{opacity:1;color:var(--vscode-editor-foreground);font-weight:600}
.view-toggle__option[aria-selected="true"]::after{content:"";position:absolute;left:50%;bottom:0;width:4px;height:4px;border-radius:50%;background:var(--vscode-testing-iconPassed);transform:translateX(-50%)}
.preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;padding-top:16px}
.preview-title{display:flex;align-items:center;gap:10px;margin-bottom:3px}
.preview-status{width:16px;height:16px;border-radius:50%;flex-shrink:0}
.preview-file{padding-left:26px;font-size:.8em;color:var(--vscode-descriptionForeground);font-family:var(--vscode-editor-font-family,monospace)}
.chev{display:inline-block;width:14px;text-align:center;font-size:.9em;color:var(--vscode-descriptionForeground);transition:transform .15s ease}
details[open]>summary .chev{transform:rotate(90deg)}
summary{list-style:none;cursor:pointer;user-select:none}
summary::-webkit-details-marker{display:none}`;

function modeToggle(mode: 'default' | 'compact'): string {
	return `<div class="view-toggle" role="tablist" aria-label="Preview layout">
  <button type="button" role="tab" aria-selected="${mode === 'default'}" class="view-toggle__option" onclick="switchMode('default')">Standard</button>
  <button type="button" role="tab" aria-selected="${mode === 'compact'}" class="view-toggle__option" onclick="switchMode('compact')">Compact</button>
</div>`;
}

// ─── Story header (Variant C — pill + story title) ─────────────────────────────

function storyHeader(story: LivePreviewStory, shortFile: string, mode: 'default' | 'compact'): string {
	const storyLink = story.url
		? `<a href="${esc(story.url)}" style="font-size:.78em;color:var(--vscode-focusBorder);text-decoration:none" target="_blank">${esc(story.id)} ↗</a>`
		: `<span style="font-size:.78em;color:var(--vscode-descriptionForeground)">${esc(story.id)}</span>`;

	const estimation = story.estimation != null
		? `<div style="font-size:.82em;color:var(--vscode-testing-iconPassed);font-weight:700">${story.estimation}h estimate</div>`
		: '';

	return `
<div style="padding-top:16px;margin-bottom:12px">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
    <div style="min-width:0;flex:1">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <span style="font-size:.78em;font-weight:700;background:rgba(0,122,204,.15);border:1px solid rgba(0,122,204,.3);color:var(--vscode-focusBorder);border-radius:10px;padding:1px 9px;letter-spacing:.04em">DRY RUN</span>
        ${storyLink}
        <span style="font-size:.78em;color:var(--vscode-descriptionForeground)">·</span>
        <span style="font-size:.78em;color:var(--vscode-descriptionForeground)">via Live Preview</span>
      </div>
      <h1 style="font-size:1em;font-weight:600;margin:0 0 4px;line-height:1.4">${esc(story.title)}</h1>
      <div style="font-size:.8em;color:var(--vscode-descriptionForeground);font-family:var(--vscode-editor-font-family,monospace)">${esc(shortFile)}</div>
    </div>
    <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
      ${modeToggle(mode)}
      ${estimation}
    </div>
  </div>
</div>
<div style="border-top:1px solid var(--vscode-panel-border,#3d3d3d);margin-bottom:14px"></div>`;
}

// ─── Error header (plain, no story context) ────────────────────────────────────

function errorPageHeader(shortFile: string, fileName: string): string {
	return `
<div class="preview-head" style="padding-top:16px">
  <div>
    <div class="preview-title">
      <div class="preview-status" style="background:var(--vscode-focusBorder)"></div>
      <h1 style="font-size:1em;font-weight:600;margin:0">Live Preview</h1>
    </div>
    <div class="preview-file" title="${esc(fileName)}">${esc(shortFile)}</div>
  </div>
</div>
<div style="border-top:1px solid var(--vscode-panel-border,#3d3d3d);margin-bottom:14px"></div>`;
}

// ─── Icon bubble error states ─────────────────────────────────────────────────

function iconBubble(icon: string, isError: boolean): string {
	const bg = isError ? 'rgba(241,76,76,.1)' : 'rgba(204,167,0,.1)';
	const border = isError ? 'rgba(241,76,76,.2)' : 'rgba(204,167,0,.2)';
	const color = isError ? 'var(--vscode-errorForeground,#f48771)' : '#cca700';
	return `<div style="width:32px;height:32px;border-radius:50%;background:${bg};border:1px solid ${border};display:flex;align-items:center;justify-content:center;font-size:1em;color:${color};flex-shrink:0">${esc(icon)}</div>`;
}

function errorBubbleState(icon: string, title: string, body: string, isError: boolean, ctaHtml: string): string {
	return `
<div style="display:flex;gap:14px;align-items:flex-start;padding:8px 0">
  ${iconBubble(icon, isError)}
  <div>
    <div style="font-weight:600;margin-bottom:6px;font-size:.95em">${esc(title)}</div>
    <div style="font-size:.84em;color:var(--vscode-descriptionForeground);margin-bottom:${ctaHtml ? 12 : 0}px">${esc(body)}</div>
    ${ctaHtml}
  </div>
</div>`;
}

// ─── Results body (default layout) ────────────────────────────────────────────

function resultsBody(result: LivePreviewResult): string {
	const { tasksCalculated: tasks, tasksSkipped, estimationSummary: s } = result;
	if (!s) return '';

	const pc = s.percentageUsed;
	const col = pctColor(pc);

	const kpi = `
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
  ${([
		['Tasks', String(tasks.length), 'var(--vscode-editor-foreground)'],
		['Total', `${s.totalTaskEstimation}h`, 'var(--vscode-testing-iconPassed)'],
		['Usage', `${fmtPct(pc)}%`, col],
	] as [string, string, string][]).map(([lbl, val, c]) => `
  <div style="padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:3px;text-align:center">
    <div style="font-size:1.5em;font-weight:700;color:${c};line-height:1.2">${esc(val)}</div>
    <div style="font-size:.75em;color:var(--vscode-descriptionForeground);margin-top:2px">${esc(lbl)}</div>
  </div>`).join('')}
</div>
${s.storyEstimation > 0 ? `
<div style="margin-bottom:16px">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
    <span style="font-size:.75em;color:var(--vscode-descriptionForeground)">Story budget</span>
    <span style="font-size:.95em;font-weight:700;color:${col}">${fmtPct(pc)}%</span>
  </div>
  <div class="est-track" style="height:6px">
    <div class="est-fill" style="width:${Math.min(pc, 100)}%;background:${col}"></div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:.75em;color:var(--vscode-descriptionForeground);margin-top:3px">
    <span>0h</span><span>${s.totalTaskEstimation}h of ${s.storyEstimation}h</span>
  </div>
</div>` : ''}`;

	const taskItems = tasks.map((t, i) => `
<div style="padding:7px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:3px;margin-bottom:4px">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:${t.estimationPercent != null ? 5 : 0}px">
    <span style="font-size:.75em;color:var(--vscode-descriptionForeground);min-width:20px;text-align:right">${i + 1}.</span>
    <span style="font-size:.88em;font-weight:600;flex:1">${esc(t.title)}</span>
    <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
      ${(t.tags ?? []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}
      ${t.priority != null ? `<span class="tag" style="color:#cca700">P${t.priority}</span>` : ''}
      <span style="font-size:.88em;font-weight:700;color:var(--vscode-testing-iconPassed);min-width:30px;text-align:right">${t.estimation ?? 0}h</span>
    </div>
  </div>
  ${t.estimationPercent != null ? `
  <div style="padding-left:28px;display:flex;align-items:center;gap:8px">
    <div class="est-track" style="flex:1"><div class="est-fill" style="width:${t.estimationPercent}%;background:var(--vscode-testing-iconPassed)"></div></div>
    <span style="font-size:.78em;font-weight:700;color:var(--vscode-testing-iconPassed);min-width:32px;text-align:right">${fmtPct(t.estimationPercent)}%</span>
  </div>` : ''}
  ${t.dependsOn?.length ? `<div style="padding-left:28px;font-size:.75em;color:var(--vscode-descriptionForeground);margin-top:2px">after ${esc(t.dependsOn.join(', '))}</div>` : ''}
</div>`).join('');

	const skipped = tasksSkipped ?? [];
	const skippedHtml = !skipped.length ? '' : `
<details open>
  <summary style="display:flex;align-items:center;gap:5px;padding:6px 0;border-bottom:1px solid rgba(204,167,0,.25);margin-bottom:8px">
    <span class="chev" style="color:#cca700">›</span>
    <span style="font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#cca700">Skipped</span>
    <span style="font-size:.75em;color:var(--vscode-descriptionForeground);font-weight:400;text-transform:none;letter-spacing:normal">(${skipped.length})</span>
  </summary>
  ${skipped.map(s => `
  <div style="padding:5px 10px;background:rgba(204,167,0,.04);border-left:2px solid rgba(204,167,0,.3);border-radius:1px;margin-bottom:4px">
    <div style="font-size:.85em;font-weight:600;text-decoration:line-through;color:var(--vscode-descriptionForeground)">${esc(s.templateTask.title)}</div>
    <div style="font-size:.78em;color:var(--vscode-descriptionForeground)">${esc(s.reason)}</div>
  </div>`).join('')}
</details>`;

	return kpi + `
<details open style="margin-bottom:14px">
  <summary style="display:flex;align-items:center;gap:5px;padding:6px 0;border-bottom:1px solid var(--vscode-panel-border,#3d3d3d);margin-bottom:8px">
    <span class="chev">›</span>
    <span style="font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--vscode-descriptionForeground)">Generated tasks</span>
    <span style="font-size:.75em;color:var(--vscode-descriptionForeground);font-weight:400;text-transform:none;letter-spacing:normal">(${tasks.length})</span>
  </summary>
  ${taskItems}
</details>` + skippedHtml;
}

// ─── Results body (compact layout) ────────────────────────────────────────────

function resultsBodyCompact(result: LivePreviewResult): string {
	const { tasksCalculated: tasks, tasksSkipped, estimationSummary: s } = result;
	if (!s) return '';

	const pc = s.percentageUsed;
	const col = pctColor(pc);
	const skipped = tasksSkipped ?? [];

	const meta = `
<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:12px;padding:6px 0;border-bottom:1px solid var(--vscode-panel-border,#3d3d3d);font-size:.85em">
  <span style="color:var(--vscode-descriptionForeground)">Tasks: <strong style="color:var(--vscode-editor-foreground)">${tasks.length}</strong></span>
  ${s.storyEstimation > 0 ? `<span style="color:var(--vscode-descriptionForeground)">Budget: <strong style="color:var(--vscode-editor-foreground)">${s.storyEstimation}h</strong></span>` : ''}
  <span style="color:var(--vscode-descriptionForeground)">Total: <strong style="color:var(--vscode-testing-iconPassed)">${s.totalTaskEstimation}h</strong></span>
  ${s.storyEstimation > 0 ? `<span style="color:${col};font-weight:600">${fmtPct(pc)}% used</span>` : ''}
  ${skipped.length ? `<span style="color:var(--vscode-descriptionForeground)">${skipped.length} skipped</span>` : ''}
</div>`;

	function thHtml(label: string): string {
		const align = label === '#' || label === 'Est' || label === '%' ? 'right' : 'left';
		const pl = label === '#' ? '0' : '8px';
		return `<th style="text-align:${align};padding:4px 8px 6px ${pl};font-size:.78em;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);font-weight:700;border-bottom:1px solid var(--vscode-panel-border,#3d3d3d)">${esc(label)}</th>`;
	}

	const rows = tasks.map((t, i) => `
<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
  <td style="padding:5px 8px 5px 0;color:var(--vscode-descriptionForeground);vertical-align:top;text-align:right">${i + 1}</td>
  <td style="padding:5px 8px 5px 0;vertical-align:top">
    <div style="font-weight:600">${esc(t.title)}</div>
    ${t.dependsOn?.length ? `<div style="font-size:.78em;color:var(--vscode-descriptionForeground)">← ${esc(t.dependsOn.join(', '))}</div>` : ''}
  </td>
  <td style="padding:5px 8px;text-align:right;vertical-align:top;color:var(--vscode-testing-iconPassed);font-weight:700">${t.estimation ?? 0}h</td>
  <td style="padding:5px 8px;text-align:right;vertical-align:top;color:var(--vscode-descriptionForeground)">${t.estimationPercent != null ? `${fmtPct(t.estimationPercent)}%` : '—'}</td>
  <td style="padding:5px 0;vertical-align:top">
    <div style="display:flex;gap:3px;flex-wrap:wrap">
      ${(t.tags ?? []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}
      ${t.priority != null ? `<span class="tag" style="color:#cca700">P${t.priority}</span>` : ''}
    </div>
  </td>
</tr>`).join('');

	const table = `
<div style="overflow-x:auto;margin-bottom:12px">
  <table style="width:100%;border-collapse:collapse;font-size:.84em">
    <thead><tr>${thHtml('#')}${thHtml('Task')}${thHtml('Est')}${thHtml('%')}${thHtml('Tags')}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;

	const skippedHtml = !skipped.length ? '' : `
<details style="margin-top:4px">
  <summary style="font-size:.82em;color:var(--vscode-descriptionForeground);padding:3px 0">
    ${skipped.length} skipped task${skipped.length === 1 ? '' : 's'} ›
  </summary>
  <div style="margin-top:5px">
    ${skipped.map(s => `
    <div style="font-size:.82em;color:var(--vscode-descriptionForeground);padding:3px 0 3px 10px;border-left:1px solid rgba(255,255,255,.12);margin-bottom:3px">
      <span style="text-decoration:line-through">${esc(s.templateTask.title)}</span> — ${esc(s.reason)}
    </div>`).join('')}
  </div>
</details>`;

	return meta + table + skippedHtml;
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

function page(title: string, body: string, script: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>${esc(title)}</title>
<style>${SHARED_CSS}</style>
</head>
<body>
${body}
<script>
var vscode = acquireVsCodeApi();
${script}
</script>
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function renderLivePreviewResults(
	report: AtomizationReport,
	mode: 'default' | 'compact',
	fileName: string,
): string {
	const result = report.results[0];
	const story = result.story;
	const shortFile = fileName.split(/[/\\]/).pop() ?? fileName;
	const header = storyHeader(story, shortFile, mode);

	let body: string;
	let extraScript = '';

	if (!result.success && result.error) {
		// Skipped state — amber icon, no CTA
		body = header + errorBubbleState('⊘', 'Story was skipped', result.error, false, '');
	} else if (result.tasksCalculated.length === 0) {
		// Empty state — amber icon, "Open template" CTA
		const cta = `<button id="btn-open-template" class="btn-primary" style="margin-top:4px">Open template</button>`;
		body = header + errorBubbleState('○', 'No tasks generated',
			'The template produced no tasks for this story. All tasks may have been filtered out by conditions.',
			false, cta);
		extraScript = `document.getElementById('btn-open-template').addEventListener('click', function() { vscode.postMessage({ type: 'openTemplate' }); });`;
	} else {
		// Results state
		const resultsHtml = mode === 'default' ? resultsBody(result) : resultsBodyCompact(result);
		body = header + resultsHtml;
	}

	const script = `function switchMode(m) { vscode.postMessage({ type: 'switchMode', mode: m }); }
${extraScript}`;

	return page('Atomize: Live Preview — Dry Run', body, script);
}

export function renderLivePreviewError(
	kind: 'auth' | 'notfound',
	detail: string,
	fileName: string,
): string {
	const shortFile = fileName.split(/[/\\]/).pop() ?? fileName;
	const header = errorPageHeader(shortFile, fileName);

	let title: string;
	let ctaHtml: string;
	let ctaScript: string;

	if (kind === 'auth') {
		title = 'Authentication failed';
		detail = detail.replace(/^authentication failed[:\s]*/i, '').trim();
		ctaHtml = `<button id="btn-manage-profiles" class="btn-primary" style="margin-top:4px">Manage Profiles</button>`;
		ctaScript = `document.getElementById('btn-manage-profiles').addEventListener('click', function() { vscode.postMessage({ type: 'manageProfiles' }); });`;
	} else {
		title = 'Work item not found';
		ctaHtml = `<button id="btn-rerun" class="btn-primary" style="margin-top:4px">Re-run with different ID</button>`;
		ctaScript = `document.getElementById('btn-rerun').addEventListener('click', function() { vscode.postMessage({ type: 'rerun' }); });`;
	}

	const body = header + errorBubbleState('⚠', title, detail, true, ctaHtml);
	return page(`Atomize: Live Preview — ${kind === 'auth' ? 'Auth Error' : 'Not Found'}`, body, ctaScript);
}
