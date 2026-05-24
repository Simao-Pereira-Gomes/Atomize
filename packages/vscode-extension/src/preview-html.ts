import css from './webview/styles.generated.css';

export interface InspectField {
	name: string;
	type: 'string' | 'number' | 'boolean' | 'string[]' | 'unknown';
	sources: Array<'filter' | 'condition' | 'estimation'>;
	required?: boolean;
}

export interface InspectResult {
	fields: InspectField[];
}

export interface PreviewTask {
	title: string;
	estimation: number;
	estimationPercent?: number;
	dependsOn?: string[];
	tags?: string[];
	priority?: number;
	activity?: string;
}

export interface PreviewResult {
	tasks: PreviewTask[];
	skippedTasks: Array<{ title: string; reason: string }>;
	estimationSummary: {
		storyEstimation: number;
		totalTaskEstimation: number;
		percentageUsed: number;
	};
}

export type StoredValue = string | number | boolean | string[];
export type StoredValues = Record<string, StoredValue>;

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
input[type="text"],input[type="number"]{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:4px 8px;border-radius:4px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);outline:none;width:100%;box-sizing:border-box}
input[type="text"]:focus,input[type="number"]:focus{border-color:var(--vscode-focusBorder);outline:1px solid var(--vscode-focusBorder);outline-offset:0}
input[type="checkbox"]{accent-color:var(--vscode-focusBorder);width:14px;height:14px;cursor:pointer;vertical-align:middle}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:6px 14px;border-radius:2px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.btn-primary:hover:not(:disabled){background:var(--vscode-button-hoverBackground)}
.btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:6px 14px;border-radius:2px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);cursor:pointer}
.btn-secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
.sec-head{font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--vscode-descriptionForeground);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--vscode-panel-border,#3d3d3d)}
.tip{position:relative;cursor:help}
.tip::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);left:0;background:#2d2d2d;border:1px solid #555;color:#d4d4d4;padding:5px 9px;border-radius:4px;font-size:.78em;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s;z-index:10}
.tip:hover::after{opacity:1}
.tip-icon{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);font-size:.7em;color:var(--vscode-descriptionForeground);font-style:normal;line-height:1;cursor:help}
.tag{display:inline-block;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:0 5px;font-size:.75em;color:var(--vscode-descriptionForeground);line-height:1.6}
.est-track{background:rgba(255,255,255,.08);border-radius:3px;height:4px;overflow:hidden}
.est-fill{height:100%;border-radius:3px}
.preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;padding-top:16px}
.preview-title{display:flex;align-items:center;gap:10px;margin-bottom:3px}
.preview-status{width:16px;height:16px;border-radius:50%;background:var(--vscode-testing-iconPassed);flex-shrink:0}
.preview-file{padding-left:26px;font-size:.8em;color:var(--vscode-descriptionForeground);font-family:var(--vscode-editor-font-family,monospace)}
.view-toggle{display:inline-flex;align-items:center;gap:12px;flex-shrink:0;margin-top:1px}
.view-toggle__option{appearance:none;position:relative;border:0;background:transparent;color:var(--vscode-descriptionForeground);opacity:.58;font-family:var(--vscode-font-family);font-size:.78em;font-weight:500;line-height:1;padding:3px 0 7px;cursor:pointer}
.view-toggle__option:hover{opacity:.86;color:var(--vscode-editor-foreground)}
.view-toggle__option:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:3px;border-radius:2px}
.view-toggle__option[aria-selected="true"]{opacity:1;color:var(--vscode-editor-foreground);font-weight:600}
.view-toggle__option[aria-selected="true"]::after{content:"";position:absolute;left:50%;bottom:0;width:4px;height:4px;border-radius:50%;background:var(--vscode-testing-iconPassed);transform:translateX(-50%)}
summary{list-style:none;cursor:pointer;user-select:none}
summary::-webkit-details-marker{display:none}
.chev{display:inline-block;width:14px;text-align:center;font-size:.9em;color:var(--vscode-descriptionForeground);transition:transform .15s ease}
details[open]>summary .chev{transform:rotate(90deg)}`;

function modeToggle(mode: 'default' | 'compact'): string {
	return `
<div class="view-toggle" role="tablist" aria-label="Preview layout">
  <button type="button" role="tab" aria-selected="${mode === 'default'}" class="view-toggle__option" onclick="switchMode('default')">Standard</button>
  <button type="button" role="tab" aria-selected="${mode === 'compact'}" class="view-toggle__option" onclick="switchMode('compact')">Compact</button>
</div>`;
}

function pageHeader(fileName: string, mode?: 'default' | 'compact'): string {
	const shortName = fileName.split(/[/\\]/).pop() ?? fileName;
	return `
<div class="preview-head">
  <div>
    <div class="preview-title">
      <div class="preview-status"></div>
      <h1 style="font-size:1em;font-weight:600;margin:0">Mock Preview</h1>
    </div>
    <div class="preview-file" title="${esc(fileName)}">${esc(shortName)}</div>
  </div>
  ${mode ? modeToggle(mode) : ''}
</div>
`;
}

function errorBanner(err: string): string {
	return `<div style="margin-bottom:12px;padding:7px 10px;background:rgba(241,76,76,.09);border:1px solid rgba(241,76,76,.28);border-radius:3px;font-size:.84em;color:var(--vscode-errorForeground,#f48771)">${esc(err)}</div>`;
}

function dot(source: 'filter' | 'condition' | 'estimation'): string {
	const color = source === 'filter'
		? 'var(--vscode-testing-iconPassed)'
		: source === 'estimation'
			? 'var(--vscode-focusBorder)'
			: '#cca700';
	return `<span title="${source}" style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>`;
}

const PLACEHOLDERS: Record<string, string> = {
	estimation: 'e.g. 8',
	priority: 'e.g. 1',
	activity: 'e.g. Development',
	tags: 'e.g. backend, auth',
};

function fieldRow(field: InspectField, stored: StoredValues): string {
	const rawLabel = field.name.includes('.')
		? (field.name.split('.').pop() ?? field.name)
		: field.name;
	const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
	const dotsHtml = field.sources.map(dot).join('');

	if (field.type === 'boolean') {
		const checked = stored[field.name] === true ? 'checked' : '';
		return `
<div style="display:flex;align-items:center;justify-content:space-between">
  <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
    <input type="checkbox" data-field="${esc(field.name)}" data-type="boolean" ${checked} style="margin:0;flex-shrink:0">
    <span style="font-size:.84em;font-weight:500;color:var(--vscode-descriptionForeground)">${esc(label)}</span>
  </label>
  <div style="display:flex;gap:3px;align-items:center">${dotsHtml}</div>
</div>`;
	}

	const storedVal = stored[field.name];
	const displayValue = storedVal === undefined ? '' : Array.isArray(storedVal) ? storedVal.join(', ') : String(storedVal);
	const ph = PLACEHOLDERS[field.name] ?? (field.type === 'number' ? 'e.g. 1' : field.type === 'string[]' ? 'comma-separated' : 'e.g. value');
	const inputType = field.type === 'number' ? 'number' : 'text';
	const validationAttrs = field.required
		? ` required${field.name === 'estimation' && field.type === 'number' ? ' min="0.01" step="any" title="Enter a positive story estimate."' : ''}`
		: '';

	return `
<div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
    <label style="font-size:.84em;font-weight:500;color:var(--vscode-descriptionForeground)">${esc(label)}</label>
    <div style="display:flex;gap:3px;align-items:center">${dotsHtml}</div>
  </div>
  <input type="${inputType}" data-field="${esc(field.name)}" data-type="${esc(field.type)}" value="${esc(displayValue)}" placeholder="${esc(ph)}"${validationAttrs}>
</div>`;
}

function formFields(fields: InspectField[], stored: StoredValues): string {
	if (!fields.length) {
		return `
<div style="padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:3px;margin-bottom:14px;text-align:center">
  <div style="font-size:.88em;margin-bottom:4px">This template generates the same tasks for any story.</div>
  <div style="font-size:.78em;color:var(--vscode-descriptionForeground)">No mock story fields — the preview will run with default values.</div>
</div>`;
	}

	const standard = fields.filter(f => f.type !== 'unknown');
	const custom = fields.filter(f => f.type === 'unknown');

	const legend = `
<div style="margin-bottom:16px;font-size:.78em;color:var(--vscode-descriptionForeground);display:flex;gap:14px;flex-wrap:wrap">
  <span style="display:inline-flex;align-items:center;gap:5px">${dot('filter')}<span>Filter — which tasks are generated</span></span>
  <span style="display:inline-flex;align-items:center;gap:5px">${dot('condition')}<span>Condition — task properties</span></span>
  <span style="display:inline-flex;align-items:center;gap:5px">${dot('estimation')}<span>Estimation — story size</span></span>
</div>`;

	let html = legend;

	if (standard.length) {
		html += `
<div style="margin-bottom:20px">
  <div class="sec-head" style="margin-bottom:14px">Story fields</div>
  <div style="display:flex;flex-direction:column;gap:20px">
    ${standard.map(f => fieldRow(f, stored)).join('')}
  </div>
</div>`;
	}

	if (custom.length) {
		html += `
<div style="margin-bottom:20px">
  <div class="sec-head" style="margin-bottom:0;display:flex;align-items:center;gap:6px">
    Custom fields
    <span class="tip-icon tip" data-tip="Serialised into customFields in the mock story.">i</span>
  </div>
  <div style="margin-bottom:16px"></div>
  <div style="display:flex;flex-direction:column;gap:20px">
    ${custom.map(f => fieldRow(f, stored)).join('')}
  </div>
</div>`;
	}

	return html;
}

function resultsDefault(result: PreviewResult): string {
	const { tasks, skippedTasks, estimationSummary: s } = result;
	const pc = s.percentageUsed;
	const col = pctColor(pc);

	const kpiHtml = `
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

	const tasksHtml = `
<details open style="margin-bottom:14px">
  <summary style="display:flex;align-items:center;gap:5px;padding:6px 0;border-bottom:1px solid var(--vscode-panel-border,#3d3d3d);margin-bottom:8px">
    <span class="chev">›</span>
    <span style="font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--vscode-descriptionForeground)">Generated tasks</span>
    <span style="font-size:.75em;color:var(--vscode-descriptionForeground);font-weight:400;text-transform:none;letter-spacing:normal">(${tasks.length})</span>
  </summary>
  ${tasks.map((t, i) => `
  <div style="padding:7px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:3px;margin-bottom:4px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:${t.estimationPercent != null ? 5 : 0}px">
      <span style="font-size:.75em;color:var(--vscode-descriptionForeground);min-width:20px;text-align:right">${i + 1}.</span>
      <span style="font-size:.88em;font-weight:600;flex:1">${esc(t.title)}</span>
      <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
        ${(t.tags ?? []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}
        ${t.priority != null ? `<span class="tag" style="color:#cca700">P${t.priority}</span>` : ''}
        <span style="font-size:.88em;font-weight:700;color:var(--vscode-testing-iconPassed);min-width:30px;text-align:right">${t.estimation}h</span>
      </div>
    </div>
    ${t.estimationPercent != null ? `
    <div style="padding-left:28px;display:flex;align-items:center;gap:8px">
      <div class="est-track" style="flex:1"><div class="est-fill" style="width:${t.estimationPercent}%;background:var(--vscode-testing-iconPassed)"></div></div>
      <span style="font-size:.78em;font-weight:700;color:var(--vscode-testing-iconPassed);min-width:32px;text-align:right">${fmtPct(t.estimationPercent)}%</span>
    </div>` : ''}
    ${t.dependsOn ? `<div style="padding-left:28px;font-size:.75em;color:var(--vscode-descriptionForeground);margin-top:2px">after ${esc(t.dependsOn.join(', '))}</div>` : ''}
  </div>`).join('')}
</details>`;

	const skippedHtml = !skippedTasks.length ? '' : `
<details open>
  <summary style="display:flex;align-items:center;gap:5px;padding:6px 0;border-bottom:1px solid rgba(204,167,0,.25);margin-bottom:8px">
    <span class="chev" style="color:#cca700">›</span>
    <span style="font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#cca700">Skipped</span>
    <span style="font-size:.75em;color:var(--vscode-descriptionForeground);font-weight:400;text-transform:none;letter-spacing:normal">(${skippedTasks.length})</span>
  </summary>
  ${skippedTasks.map(t => `
  <div style="padding:5px 10px;background:rgba(204,167,0,.04);border-left:2px solid rgba(204,167,0,.3);border-radius:1px;margin-bottom:4px">
    <div style="font-size:.85em;font-weight:600;text-decoration:line-through;color:var(--vscode-descriptionForeground)">${esc(t.title)}</div>
    <div style="font-size:.78em;color:var(--vscode-descriptionForeground)">${esc(t.reason)}</div>
  </div>`).join('')}
</details>`;

	return kpiHtml + tasksHtml + skippedHtml;
}

function thHtml(label: string): string {
	const align = label === '#' || label === 'Est' || label === '%' ? 'right' : 'left';
	const pl = label === '#' ? '0' : '8px';
	return `<th style="text-align:${align};padding:4px 8px 6px ${pl};font-size:.78em;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);font-weight:700;border-bottom:1px solid var(--vscode-panel-border,#3d3d3d)">${esc(label)}</th>`;
}

function resultsCompact(result: PreviewResult): string {
	const { tasks, skippedTasks, estimationSummary: s } = result;
	const pc = s.percentageUsed;

	const metaHtml = `
<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:12px;padding:6px 0;border-bottom:1px solid var(--vscode-panel-border,#3d3d3d);font-size:.85em">
  <span style="color:var(--vscode-descriptionForeground)">Tasks: <strong style="color:var(--vscode-editor-foreground)">${tasks.length}</strong></span>
  ${s.storyEstimation > 0 ? `<span style="color:var(--vscode-descriptionForeground)">Budget: <strong style="color:var(--vscode-editor-foreground)">${s.storyEstimation}h</strong></span>` : ''}
  <span style="color:var(--vscode-descriptionForeground)">Total: <strong style="color:var(--vscode-testing-iconPassed)">${s.totalTaskEstimation}h</strong></span>
  ${s.storyEstimation > 0 ? `<span style="color:${pctColor(pc)};font-weight:600">${fmtPct(pc)}% used</span>` : ''}
  ${skippedTasks.length ? `<span style="color:var(--vscode-descriptionForeground)">${skippedTasks.length} skipped</span>` : ''}
</div>`;

	const tableHtml = `
<div style="overflow-x:auto;margin-bottom:12px">
  <table style="width:100%;border-collapse:collapse;font-size:.84em">
    <thead><tr>${thHtml('#')}${thHtml('Task')}${thHtml('Est')}${thHtml('%')}${thHtml('Tags')}</tr></thead>
    <tbody>
      ${tasks.map((t, i) => `
      <tr style="border-bottom:1px solid rgba(255,255,255,.04)">
        <td style="padding:5px 8px 5px 0;color:var(--vscode-descriptionForeground);vertical-align:top;text-align:right">${i + 1}</td>
        <td style="padding:5px 8px 5px 0;vertical-align:top">
          <div style="font-weight:600">${esc(t.title)}</div>
          ${t.dependsOn ? `<div style="font-size:.78em;color:var(--vscode-descriptionForeground)">← ${esc(t.dependsOn.join(', '))}</div>` : ''}
        </td>
        <td style="padding:5px 8px;text-align:right;vertical-align:top;color:var(--vscode-testing-iconPassed);font-weight:700">${t.estimation}h</td>
        <td style="padding:5px 8px;text-align:right;vertical-align:top;color:var(--vscode-descriptionForeground)">${t.estimationPercent != null ? `${fmtPct(t.estimationPercent)}%` : '—'}</td>
        <td style="padding:5px 0;vertical-align:top">
          <div style="display:flex;gap:3px;flex-wrap:wrap">
            ${(t.tags ?? []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}
            ${t.priority != null ? `<span class="tag" style="color:#cca700">P${t.priority}</span>` : ''}
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>
${skippedTasks.length ? `
<details style="margin-top:4px">
  <summary style="font-size:.82em;color:var(--vscode-descriptionForeground);padding:3px 0">
    ${skippedTasks.length} skipped task${skippedTasks.length === 1 ? '' : 's'} ›
  </summary>
  <div style="margin-top:5px">
    ${skippedTasks.map(t => `
    <div style="font-size:.82em;color:var(--vscode-descriptionForeground);padding:3px 0 3px 10px;border-left:1px solid rgba(255,255,255,.12);margin-bottom:3px">
      <span style="text-decoration:line-through">${esc(t.title)}</span> — ${esc(t.reason)}
    </div>`).join('')}
  </div>
</details>` : ''}`;

	return metaHtml + tableHtml;
}

export function renderPreviewForm(
	fields: InspectField[],
	storedValues: StoredValues,
	fileName: string,
	error?: string,
): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Atomize: Mock Preview</title>
<style>${SHARED_CSS}</style>
</head>
<body>
${pageHeader(fileName)}
${error ? errorBanner(error) : ''}
<form id="pf" style="max-width:640px">
${formFields(fields, storedValues)}
<div style="margin-top:24px">
  <span class="tip" data-tip="Builds a mock story and runs preview" style="display:inline-block">
    <button type="submit" class="btn-primary">Run Preview</button>
  </span>
</div>
</form>
<script>
var vscode = acquireVsCodeApi();
document.getElementById('pf').addEventListener('submit', function(e) {
  e.preventDefault();
  var values = {};
  document.querySelectorAll('[data-field]').forEach(function(el) {
    var name = el.dataset.field;
    var type = el.dataset.type;
    if (type === 'boolean') {
      values[name] = el.checked;
    } else if (type === 'number') {
      var v = parseFloat(el.value);
      if (!isNaN(v)) values[name] = v;
    } else if (type === 'string[]') {
      var arr = el.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (arr.length) values[name] = arr;
    } else if (el.value.trim()) {
      values[name] = el.value.trim();
    }
  });
  vscode.postMessage({ type: 'submit', values: values });
});
</script>
</body>
</html>`;
}

export function renderPreviewResults(
	result: PreviewResult,
	mode: 'default' | 'compact',
	fileName: string,
): string {
	const body = mode === 'default' ? resultsDefault(result) : resultsCompact(result);
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Atomize: Mock Preview — Results</title>
<style>${SHARED_CSS}</style>
</head>
<body>
${pageHeader(fileName, mode)}
${body}
<div style="margin-top:16px">
  <button id="btn-back" class="btn-secondary">← Edit mock story</button>
</div>
<script>
var vscode = acquireVsCodeApi();
function switchMode(m) { vscode.postMessage({ type: 'switchMode', mode: m }); }
document.getElementById('btn-back').addEventListener('click', function() {
  vscode.postMessage({ type: 'back' });
});
</script>
</body>
</html>`;
}
