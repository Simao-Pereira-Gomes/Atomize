import css from './webview/styles.generated.css';

// Types matching CLI AtomizationReport JSON output

export interface GenerateTask {
	title: string;
	estimation?: number;
	estimationPercent?: number;
	tags?: string[];
	priority?: number;
	dependsOn?: string[];
}

export interface GenerateStory {
	id: string;
	title: string;
	url?: string;
	estimation?: number;
}

export interface GenerateCreatedTask {
	id: string;
	title: string;
	url?: string;
}

export interface GenerateSkippedTask {
	templateTask: { title: string };
	reason: string;
}

export interface GenerateResult {
	story: GenerateStory;
	tasksCalculated: GenerateTask[];
	tasksCreated: GenerateCreatedTask[];
	tasksSkipped?: GenerateSkippedTask[];
	success: boolean;
	error?: string;
	estimationSummary?: {
		storyEstimation: number;
		totalTaskEstimation: number;
		percentageUsed: number;
	};
}

export interface GenerateReport {
	templateName: string;
	storiesProcessed: number;
	storiesSuccess: number;
	storiesFailed: number;
	tasksCalculated: number;
	tasksCreated: number;
	tasksSkipped: number;
	dryRun: boolean;
	results: GenerateResult[];
	errors: Array<{ storyId: string; error: string }>;
	warnings: string[];
	executionTime: number;
}

// Shared utilities
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

const GEN_CSS = `${css}
body{color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);margin:0;padding:0 18px 90px;line-height:1.625}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:6px 14px;border-radius:2px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.btn-primary:hover:not(:disabled){background:var(--vscode-button-hoverBackground)}
.tag{display:inline-block;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:0 5px;font-size:.75em;color:var(--vscode-descriptionForeground);line-height:1.6}
.chev{display:inline-block;width:14px;text-align:center;font-size:.9em;color:var(--vscode-descriptionForeground);transition:transform .15s ease}
details[open]>summary .chev{transform:rotate(90deg)}
summary{list-style:none;cursor:pointer;user-select:none}
summary::-webkit-details-marker{display:none}
details:not([open])>summary{border-bottom:none!important;margin-bottom:0!important}
.view-toggle{display:inline-flex;align-items:center;gap:12px;flex-shrink:0;margin-top:1px}
.view-toggle__option{appearance:none;position:relative;border:0;background:transparent;color:var(--vscode-descriptionForeground);opacity:.58;font-family:var(--vscode-font-family);font-size:.78em;font-weight:500;line-height:1;padding:3px 0 7px;cursor:pointer}
.view-toggle__option:hover{opacity:.86;color:var(--vscode-editor-foreground)}
.view-toggle__option[aria-selected="true"]{opacity:1;color:var(--vscode-editor-foreground);font-weight:600}
.view-toggle__option[aria-selected="true"]::after{content:"";position:absolute;left:50%;bottom:0;width:4px;height:4px;border-radius:50%;background:var(--vscode-testing-iconPassed);transform:translateX(-50%)}
.generate-badge{font-size:.78em;font-weight:700;background:rgba(115,201,145,.12);border:1px solid rgba(115,201,145,.28);color:var(--vscode-testing-iconPassed);border-radius:10px;padding:1px 9px;letter-spacing:.04em}
.dry-run-badge{font-size:.78em;font-weight:700;background:rgba(0,122,204,.12);border:1px solid rgba(0,122,204,.28);color:var(--vscode-focusBorder);border-radius:10px;padding:1px 9px;letter-spacing:.04em}
.live-badge{font-size:.78em;font-weight:700;background:rgba(115,201,145,.12);border:1px solid rgba(115,201,145,.28);color:var(--vscode-testing-iconPassed);border-radius:10px;padding:1px 9px;letter-spacing:.04em}
.partial-badge{font-size:.78em;font-weight:700;background:rgba(241,76,76,.1);border:1px solid rgba(241,76,76,.2);color:var(--vscode-testing-iconFailed);border-radius:10px;padding:1px 9px;letter-spacing:.04em}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.15);border-top-color:var(--vscode-focusBorder);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.action-zone{border-top:1px solid var(--vscode-panel-border,#3d3d3d);margin-top:18px;padding-top:14px}
.split-btn{display:inline-flex;border-radius:2px}
.split-btn__main{border-radius:2px 0 0 2px}
.split-btn__arrow{border-radius:0 2px 2px 0;border-left:1px solid rgba(255,255,255,.22)!important;padding:6px 10px;font-size:.9em;line-height:1}
.split-btn__arrow:hover{background:var(--vscode-button-hoverBackground)}
.split-menu{display:none;position:absolute;top:calc(100% + 8px);right:0;left:auto;min-width:240px;background:var(--vscode-menu-background,#252526);border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:4px 0;z-index:200;box-shadow:0 6px 24px rgba(0,0,0,.65),0 1px 4px rgba(0,0,0,.4)}
.split-menu.open{display:block}
.split-menu::before{content:'';position:absolute;top:-7px;right:7px;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:7px solid rgba(255,255,255,.12)}
.split-menu::after{content:'';position:absolute;top:-6px;right:8px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:6px solid var(--vscode-menu-background,#252526)}
.menu-row{display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:6px 12px;margin:0;width:100%;box-sizing:border-box;transition:background .08s}
.menu-row:hover{background:rgba(255,255,255,.07)}`;

function panelHeader(
	mode: 'default' | 'compact',
	showToggle: boolean,
	shortFile: string,
	profile: string,
	filterLabel?: string,
): string {
	const toggleHtml = showToggle
		? `<div class="view-toggle" role="tablist" aria-label="Panel layout">
    <button type="button" role="tab" aria-selected="${mode === 'default'}" class="view-toggle__option" onclick="switchMode('default')">Standard</button>
    <button type="button" role="tab" aria-selected="${mode === 'compact'}" class="view-toggle__option" onclick="switchMode('compact')">Compact</button>
  </div>`
		: '';

	const subtitle = filterLabel
		? `<span style="font-size:.78em;color:var(--vscode-descriptionForeground)">${esc(filterLabel)}</span>
       <span style="font-size:.78em;color:var(--vscode-descriptionForeground)">·</span>
       <span style="font-size:.78em;font-weight:600">${esc(profile)}</span>`
		: `<span style="font-size:.78em;font-weight:600">${esc(profile)}</span>`;

	return `
<div style="padding-top:16px;margin-bottom:12px">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
    <div style="min-width:0;flex:1">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
        <span class="generate-badge">GENERATE</span>
        ${subtitle}
      </div>
      <div style="font-size:.8em;color:var(--vscode-descriptionForeground);font-family:var(--vscode-editor-font-family,monospace)">${esc(shortFile)}</div>
    </div>
    ${toggleHtml}
  </div>
</div>
<div style="border-top:1px solid var(--vscode-panel-border,#3d3d3d);margin-bottom:14px"></div>`;
}

function dryRunKpis(report: GenerateReport): string {
	const totalH = report.results.reduce((s, r) => s + (r.estimationSummary?.totalTaskEstimation ?? 0), 0);
	const totalBudget = report.results.reduce((s, r) => s + (r.estimationSummary?.storyEstimation ?? 0), 0);
	const pct = totalBudget > 0 ? (totalH / totalBudget) * 100 : 0;
	const col = pctColor(pct);

	const kpis: [string, string, string][] = [
		['Stories', String(report.storiesSuccess), 'var(--vscode-editor-foreground)'],
		['Tasks', String(report.tasksCalculated), 'var(--vscode-editor-foreground)'],
		['Total', `${totalH}h`, 'var(--vscode-testing-iconPassed)'],
		['Budget', totalBudget > 0 ? `${fmtPct(pct)}%` : '—', col],
	];

	return `
<div style="margin-bottom:14px">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <span class="dry-run-badge">DRY RUN</span>
    <span style="font-size:.82em;color:var(--vscode-descriptionForeground)">Simulated — no tasks created yet</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
    ${kpis.map(([l, v, c]) => `
    <div style="padding:9px 10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:3px;text-align:center">
      <div style="font-size:1.4em;font-weight:700;color:${c};line-height:1.2">${esc(v)}</div>
      <div style="font-size:.75em;color:var(--vscode-descriptionForeground);margin-top:2px">${esc(l)}</div>
    </div>`).join('')}
  </div>
</div>`;
}

function storySection(result: GenerateResult): string {
	const { story, tasksCalculated: tasks, tasksSkipped } = result;
	const storyH = result.estimationSummary?.totalTaskEstimation ?? tasks.reduce((s, t) => s + (t.estimation ?? 0), 0);
	const skippedCount = tasksSkipped?.length ?? 0;

	const storyLink = story.url
		? `<a href="${esc(story.url)}" style="color:var(--vscode-focusBorder);text-decoration:none">#${esc(story.id)} ↗</a>`
		: `<span style="color:var(--vscode-focusBorder)">#${esc(story.id)}</span>`;

	const warningHtml = skippedCount > 0
		? `<div style="margin:4px 0 8px;padding:5px 10px;background:rgba(204,167,0,.06);border-left:2px solid rgba(204,167,0,.35);border-radius:1px;font-size:.82em;color:#cca700">${skippedCount} task${skippedCount === 1 ? '' : 's'} skipped${tasksSkipped?.[0] ? ` — ${esc(tasksSkipped[0].reason)}` : ''}</div>`
		: (!result.success && result.error
			? `<div style="margin:4px 0 8px;padding:5px 10px;background:rgba(241,76,76,.06);border-left:2px solid rgba(241,76,76,.2);border-radius:1px;font-size:.82em;color:var(--vscode-errorForeground,#f48771)">${esc(result.error)}</div>`
			: '');

	const taskItems = tasks.map((t, i) => `
<div style="padding:6px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:3px;margin-bottom:3px;display:flex;align-items:center;gap:8px">
  <span style="font-size:.75em;color:var(--vscode-descriptionForeground);min-width:18px;text-align:right">${i + 1}.</span>
  <span style="font-size:.88em;font-weight:600;flex:1">${esc(t.title)}</span>
  ${(t.tags ?? []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}
  ${t.priority != null ? `<span class="tag" style="color:#cca700">P${t.priority}</span>` : ''}
  <span style="font-size:.88em;font-weight:700;color:var(--vscode-testing-iconPassed)">${t.estimation ?? 0}h</span>
</div>`).join('');

	return `
<details open style="margin-bottom:10px">
  <summary style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--vscode-panel-border,#3d3d3d);margin-bottom:8px">
    <span class="chev">›</span>
    <div style="font-size:.88em;font-weight:600;flex:1">${esc(story.title)}</div>
    <div style="display:flex;align-items:center;gap:10px;font-size:.78em;color:var(--vscode-descriptionForeground)">
      ${storyLink}
      <span>${tasks.length} task${tasks.length !== 1 ? 's' : ''}</span>
      <span style="color:var(--vscode-testing-iconPassed);font-weight:700">${storyH}h</span>
    </div>
  </summary>
  ${warningHtml}${taskItems}
</details>`;
}

function storySectionCompact(result: GenerateResult): string {
	const { story, tasksCalculated: tasks, tasksSkipped } = result;
	const storyH = result.estimationSummary?.totalTaskEstimation ?? tasks.reduce((s, t) => s + (t.estimation ?? 0), 0);
	const skippedCount = tasksSkipped?.length ?? 0;

	const storyLink = story.url
		? `<a href="${esc(story.url)}" style="color:var(--vscode-focusBorder);text-decoration:none">#${esc(story.id)} ↗</a>`
		: `<span style="color:var(--vscode-focusBorder)">#${esc(story.id)}</span>`;

	const warningHtml = skippedCount > 0
		? `<div style="margin-bottom:5px;font-size:.78em;color:#cca700">⚠ ${skippedCount} task${skippedCount === 1 ? '' : 's'} skipped${tasksSkipped?.[0] ? ` — ${esc(tasksSkipped[0].reason)}` : ''}</div>`
		: (!result.success && result.error
			? `<div style="margin-bottom:5px;font-size:.78em;color:var(--vscode-errorForeground,#f48771)">✗ ${esc(result.error)}</div>`
			: '');

	const rows = tasks.map((t, i) => `
<tr style="border-bottom:1px solid rgba(255,255,255,.04)">
  <td style="padding:4px 8px 4px 0;color:var(--vscode-descriptionForeground);text-align:right;vertical-align:top">${i + 1}</td>
  <td style="padding:4px 8px;font-weight:600;vertical-align:top">${esc(t.title)}</td>
  <td style="padding:4px 8px;text-align:right;color:var(--vscode-testing-iconPassed);font-weight:700;vertical-align:top">${t.estimation ?? 0}h</td>
  <td style="padding:4px 0;vertical-align:top">${(t.tags ?? []).map(tag => `<span class="tag">${esc(tag)}</span>`).join(' ')}</td>
</tr>`).join('');

	return `
<details open style="margin-bottom:10px">
  <summary style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--vscode-panel-border,#3d3d3d);margin-bottom:6px">
    <span class="chev">›</span>
    <span style="font-size:.85em;font-weight:600;flex:1">${esc(story.title)}</span>
    <span style="font-size:.78em;color:var(--vscode-descriptionForeground)">
      ${storyLink} · ${tasks.length} tasks · <strong style="color:var(--vscode-testing-iconPassed)">${storyH}h</strong>
    </span>
  </summary>
  ${warningHtml}<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.83em">
      <thead><tr>
        <th style="text-align:right;padding:3px 8px 5px 0;font-size:.78em;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border,#3d3d3d)">#</th>
        <th style="text-align:left;padding:3px 8px 5px;font-size:.78em;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border,#3d3d3d)">Task</th>
        <th style="text-align:right;padding:3px 8px 5px;font-size:.78em;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border,#3d3d3d)">Est</th>
        <th style="text-align:left;padding:3px 0 5px;font-size:.78em;text-transform:uppercase;letter-spacing:.06em;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border,#3d3d3d)">Tags</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</details>`;
}

function splitButton(nTasks: number, profile: string): string {
	return `
<div class="action-zone">
  <div style="position:relative;display:inline-block" id="split-container">
    <div class="split-btn">
      <button class="btn-primary split-btn__main" id="btn-create">Create ${nTasks} Task${nTasks === 1 ? '' : 's'} in ${esc(profile)}…</button>
      <button class="btn-primary split-btn__arrow" id="split-arrow" onclick="toggleMenu(event)" title="Runtime settings" aria-haspopup="true" aria-expanded="false">▾</button>
    </div>
    <div class="split-menu" id="split-menu" role="menu">
      <label class="menu-row">
        <input type="checkbox" id="coe-check"
          style="margin-top:2px;flex-shrink:0;width:13px;height:13px;cursor:pointer;accent-color:var(--vscode-focusBorder)">
        <div>
          <div style="font-size:.87em">Continue on task failure</div>
          <div style="font-size:.78em;color:var(--vscode-descriptionForeground);margin-top:2px;line-height:1.4">
            If a task fails to create, the tool will skip it and attempt the rest.
          </div>
        </div>
      </label>
    </div>
  </div>
</div>`;
}

function collapsedDryRun(dryReport: GenerateReport): string {
	const totalH = dryReport.results.reduce((s, r) => s + (r.estimationSummary?.totalTaskEstimation ?? 0), 0);

	const storyRows = dryReport.results.map(r => {
		const { story, tasksCalculated: tasks } = r;
		const storyH = r.estimationSummary?.totalTaskEstimation ?? tasks.reduce((s, t) => s + (t.estimation ?? 0), 0);

		const storyLink = story.url
			? `<a href="${esc(story.url)}" style="color:var(--vscode-focusBorder);text-decoration:none">#${esc(story.id)} ↗</a>`
			: `<span style="color:var(--vscode-focusBorder)">#${esc(story.id)}</span>`;

		const taskItems = tasks.map((t, i) => `
<div style="display:flex;align-items:center;gap:8px;padding:3px 0 3px 20px;font-size:.81em">
  <span style="color:var(--vscode-descriptionForeground);min-width:16px;text-align:right;flex-shrink:0">${i + 1}.</span>
  <span style="flex:1;min-width:0">${esc(t.title)}</span>
  ${(t.tags ?? []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}
  <span style="color:var(--vscode-testing-iconPassed);font-weight:600;flex-shrink:0">${t.estimation ?? 0}h</span>
</div>`).join('');

		return `
<details style="margin-bottom:2px">
  <summary style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:.84em">
    <span class="chev" style="font-size:.8em">›</span>
    <span style="color:var(--vscode-testing-iconPassed);flex-shrink:0">✓</span>
    <span style="flex:1;min-width:0">${esc(story.title)}</span>
    <span style="flex-shrink:0;color:var(--vscode-descriptionForeground)">
      ${storyLink} · ${tasks.length} tasks · <span style="color:var(--vscode-testing-iconPassed);font-weight:600">${storyH}h</span>
    </span>
  </summary>
  <div style="padding:4px 0 8px">${taskItems}</div>
</details>`;
	}).join('');

	return `
<details style="margin-bottom:14px">
  <summary style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--vscode-panel-border,#3d3d3d)">
    <span class="chev">›</span>
    <span class="dry-run-badge" style="opacity:.7">DRY RUN</span>
    <span style="font-size:.82em;color:var(--vscode-descriptionForeground)">${dryReport.storiesSuccess} ${dryReport.storiesSuccess === 1 ? 'story' : 'stories'} · ${dryReport.tasksCalculated} tasks · ${totalH}h</span>
  </summary>
  <div style="padding:4px 0 8px;opacity:.75">${storyRows}</div>
</details>`;
}

// ─── Executed story result (default layout) ───────────────────────────────────

function execStoryResult(result: GenerateResult): string {
	const { story } = result;
	const storyLink = story.url
		? `<a href="${esc(story.url)}" style="color:var(--vscode-focusBorder);text-decoration:none">#${esc(story.id)} ↗</a>`
		: `<span style="color:var(--vscode-focusBorder)">#${esc(story.id)}</span>`;

	if (result.success) {
		const tasks = result.tasksCreated;
		const taskRows = tasks.map(task => {
			const taskRef = task.url
				? `<a href="${esc(task.url)}" style="color:var(--vscode-focusBorder);text-decoration:none">#${esc(task.id)}</a>`
				: `<span style="color:var(--vscode-focusBorder)">#${esc(task.id)}</span>`;
			return `
  <div style="padding:4px 10px;font-size:.83em;display:flex;align-items:center;gap:8px;margin-bottom:2px">
    <span style="color:var(--vscode-testing-iconPassed);flex-shrink:0">✓</span>
    ${taskRef}
    <span style="color:var(--vscode-descriptionForeground)">${esc(task.title)}</span>
  </div>`;
		}).join('');
		return `
<details open style="margin-bottom:10px">
  <summary style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(115,201,145,.2);margin-bottom:8px">
    <span style="color:var(--vscode-testing-iconPassed)">✓</span>
    <div style="font-size:.88em;font-weight:600;flex:1">${esc(story.title)}</div>
    <div style="font-size:.78em;color:var(--vscode-descriptionForeground)">
      ${storyLink} · <span style="color:var(--vscode-testing-iconPassed);font-weight:600">${tasks.length} created</span>
    </div>
  </summary>
  ${taskRows}
</details>`;
	}

	const nCreated = result.tasksCreated.length;
	return `
<details open style="margin-bottom:10px">
  <summary style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(241,76,76,.2);margin-bottom:8px">
    <span style="color:var(--vscode-testing-iconFailed)">✗</span>
    <div style="font-size:.88em;font-weight:600;flex:1">${esc(story.title)}</div>
    <div style="font-size:.78em;color:var(--vscode-descriptionForeground)">
      ${storyLink}${nCreated > 0 ? ` · <span style="color:var(--vscode-testing-iconPassed);font-weight:600">${nCreated} created</span>` : ''} · <span style="color:var(--vscode-testing-iconFailed);font-weight:600">failed</span>
    </div>
  </summary>
  <div style="padding:7px 10px;background:rgba(241,76,76,.06);border:1px solid rgba(241,76,76,.15);border-radius:3px;font-size:.82em;color:var(--vscode-descriptionForeground)">${esc(result.error ?? 'Unknown error')}</div>
</details>`;
}

// ─── Executed story result (compact layout) ───────────────────────────────────

function execStoryResultCompact(result: GenerateResult): string {
	const { story } = result;
	const storyLink = story.url
		? `<a href="${esc(story.url)}" style="color:var(--vscode-focusBorder);text-decoration:none">#${esc(story.id)} ↗</a>`
		: `<span style="color:var(--vscode-focusBorder)">#${esc(story.id)}</span>`;

	if (result.success) {
		const tasks = result.tasksCreated;
		const idLinks = tasks.map(t =>
			t.url
				? `<a href="${esc(t.url)}" style="color:var(--vscode-focusBorder);text-decoration:none">#${esc(t.id)}</a>`
				: `<span style="color:var(--vscode-focusBorder)">#${esc(t.id)}</span>`,
		).join(' ');
		return `
<div style="display:flex;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)">
  <span style="color:var(--vscode-testing-iconPassed);flex-shrink:0;font-size:.85em">✓</span>
  <div style="font-size:.85em;font-weight:600;flex:1;min-width:0">${esc(story.title)}</div>
  <div style="font-size:.78em;flex-shrink:0;display:flex;align-items:center;gap:8px">
    ${storyLink}
    <span style="color:var(--vscode-testing-iconPassed);font-weight:600">${tasks.length} created</span>
  </div>
</div>
<div style="padding:3px 0 6px 20px;font-size:.78em;color:var(--vscode-descriptionForeground);display:flex;gap:6px;flex-wrap:wrap">
  ${idLinks}
</div>`;
	}

	return `
<div style="display:flex;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)">
  <span style="color:var(--vscode-testing-iconFailed);flex-shrink:0;font-size:.85em">✗</span>
  <div style="font-size:.85em;font-weight:600;flex:1;min-width:0">${esc(story.title)}</div>
  <div style="font-size:.78em;flex-shrink:0;display:flex;align-items:center;gap:8px">
    ${storyLink}
    <span style="color:var(--vscode-testing-iconFailed);font-weight:600">failed</span>
  </div>
</div>
<div style="padding:3px 0 6px 20px;font-size:.78em;color:var(--vscode-descriptionForeground)">${esc(result.error ?? 'Unknown error')}</div>`;
}

// ─── Error bubble ─────────────────────────────────────────────────────────────

function iconBubble(icon: string, isError: boolean): string {
	const bg = isError ? 'rgba(241,76,76,.1)' : 'rgba(204,167,0,.1)';
	const border = isError ? 'rgba(241,76,76,.2)' : 'rgba(204,167,0,.2)';
	const color = isError ? 'var(--vscode-errorForeground,#f48771)' : '#cca700';
	return `<div style="width:32px;height:32px;border-radius:50%;background:${bg};border:1px solid ${border};display:flex;align-items:center;justify-content:center;font-size:1em;color:${color};flex-shrink:0">${esc(icon)}</div>`;
}

function errorBubble(icon: string, title: string, body: string, isError: boolean, ctaHtml: string): string {
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

// ─── Page wrapper ─────────────────────────────────────────────────────────────

function page(title: string, body: string, script: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>${esc(title)}</title>
<style>${GEN_CSS}</style>
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

// ─── Shared script fragments ──────────────────────────────────────────────────

const SWITCH_MODE_SCRIPT = `function switchMode(m) { vscode.postMessage({ type: 'switchMode', mode: m }); }`;

const SPLIT_BUTTON_SCRIPT = `
${SWITCH_MODE_SCRIPT}
function toggleMenu(e) {
  e.stopPropagation();
  var menu = document.getElementById('split-menu');
  var arrow = document.getElementById('split-arrow');
  if (!menu) return;
  var open = menu.classList.toggle('open');
  if (arrow) arrow.setAttribute('aria-expanded', String(open));
}
document.addEventListener('click', function(e) {
  if (!e.target.closest('#split-container')) {
    var menu = document.getElementById('split-menu');
    var arrow = document.getElementById('split-arrow');
    if (menu) menu.classList.remove('open');
    if (arrow) arrow.setAttribute('aria-expanded', 'false');
  }
});
var btn = document.getElementById('btn-create');
if (btn) {
  btn.addEventListener('click', function() {
    var coe = document.getElementById('coe-check');
    vscode.postMessage({ type: 'createTasks', continueOnError: coe ? coe.checked : false });
  });
}`;

// ─── Public API ───────────────────────────────────────────────────────────────

export function renderGenerateLoading(fileName: string, profile: string): string {
	const shortFile = fileName.split(/[/\\]/).pop() ?? fileName;
	const header = panelHeader('default', false, shortFile, profile);
	const body = `${header}
<div style="display:flex;align-items:center;gap:10px;padding:16px 0;color:var(--vscode-descriptionForeground)">
  <div class="spinner"></div>
  <span style="font-size:.9em">Running dry run against <strong style="color:var(--vscode-editor-foreground)">${esc(profile)}</strong>…</span>
</div>
<div style="font-size:.8em;color:var(--vscode-descriptionForeground);padding-left:24px;margin-top:2px">Fetching matching stories from template filter</div>`;
	return page('Atomize: Generate — Dry Run', body, '');
}

export function renderGenerateDrySuccess(
	report: GenerateReport,
	mode: 'default' | 'compact',
	fileName: string,
	profile: string,
): string {
	const shortFile = fileName.split(/[/\\]/).pop() ?? fileName;
	const header = panelHeader(mode, true, shortFile, profile, report.templateName);
	const kpis = dryRunKpis(report);
	const stories = mode === 'default'
		? report.results.map(storySection).join('')
		: report.results.map(storySectionCompact).join('');
	const body = header + kpis + stories + splitButton(report.tasksCalculated, profile);
	return page('Atomize: Generate', body, SPLIT_BUTTON_SCRIPT);
}

export function renderGenerateDryWarnings(
	report: GenerateReport,
	mode: 'default' | 'compact',
	fileName: string,
	profile: string,
): string {
	const shortFile = fileName.split(/[/\\]/).pop() ?? fileName;
	const header = panelHeader(mode, true, shortFile, profile, report.templateName);
	const kpis = dryRunKpis(report);
	const stories = mode === 'default'
		? report.results.map(storySection).join('')
		: report.results.map(storySectionCompact).join('');
	const action = report.storiesFailed === 0
		? splitButton(report.tasksCalculated, profile)
		: `<div class="action-zone"><span style="font-size:.84em;color:var(--vscode-descriptionForeground)">⚠ ${report.storiesFailed} ${report.storiesFailed === 1 ? 'story' : 'stories'} failed — fix errors before creating tasks.</span></div>`;
	const body = header + kpis + stories + action;
	return page('Atomize: Generate', body, report.storiesFailed === 0 ? SPLIT_BUTTON_SCRIPT : SWITCH_MODE_SCRIPT);
}

export function renderGenerateBlocked(
	kind: 'auth' | 'no-matches' | 'no-tasks',
	detail: string,
	fileName: string,
	profile: string,
): string {
	const shortFile = fileName.split(/[/\\]/).pop() ?? fileName;
	const header = panelHeader('default', false, shortFile, profile);

	if (kind === 'auth') {
		const ctaHtml = `<button id="btn-manage-profiles" class="btn-primary" style="margin-top:4px">Manage Profiles</button>`;
		const body = header + errorBubble('⚠', 'Authentication failed', detail, true, ctaHtml);
		const script = `document.getElementById('btn-manage-profiles').addEventListener('click', function() { vscode.postMessage({ type: 'manageProfiles' }); });`;
		return page('Atomize: Generate — Auth Error', body, script);
	}

	if (kind === 'no-matches') {
		const body = header
			+ `<div style="margin-bottom:14px"><span class="dry-run-badge">DRY RUN</span></div>`
			+ errorBubble('○', 'No matching stories', detail, false, '');
		return page('Atomize: Generate — No Matches', body, '');
	}

	// no-tasks
	const body = header
		+ `<div style="margin-bottom:14px"><span class="dry-run-badge">DRY RUN</span></div>`
		+ errorBubble('○', 'No tasks to create', detail, false, '');
	return page('Atomize: Generate — No Tasks', body, '');
}

export function renderGenerateLiveRunning(
	dryReport: GenerateReport,
	fileName: string,
	profile: string,
): string {
	const shortFile = fileName.split(/[/\\]/).pop() ?? fileName;
	const header = panelHeader('default', false, shortFile, profile, dryReport.templateName);
	const collapsed = collapsedDryRun(dryReport);
	const body = `${header}${collapsed}
<div style="border-top:1px solid var(--vscode-panel-border,#3d3d3d);margin-bottom:14px"></div>
<div style="display:flex;align-items:center;gap:10px;padding:8px 0;color:var(--vscode-descriptionForeground)">
  <div class="spinner"></div>
  <span style="font-size:.9em">Creating tasks in <strong style="color:var(--vscode-editor-foreground)">${esc(profile)}</strong>…</span>
</div>
<div style="font-size:.8em;color:var(--vscode-descriptionForeground);margin-top:4px;padding-left:24px">Story 1 of ${dryReport.storiesSuccess}</div>`;
	return page('Atomize: Generate — Creating…', body, '');
}

export function renderGenerateLiveSuccess(
	dryReport: GenerateReport,
	execReport: GenerateReport,
	mode: 'default' | 'compact',
	fileName: string,
	profile: string,
): string {
	const shortFile = fileName.split(/[/\\]/).pop() ?? fileName;
	const header = panelHeader(mode, true, shortFile, profile, execReport.templateName);
	const collapsed = collapsedDryRun(dryReport);
	const stories = mode === 'default'
		? execReport.results.map(execStoryResult).join('')
		: execReport.results.map(execStoryResultCompact).join('');
	const body = `${header}${collapsed}
<div style="border-top:1px solid var(--vscode-panel-border,#3d3d3d);margin-bottom:14px"></div>
<div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
    <span class="live-badge">CREATED</span>
    <span style="font-size:.82em;color:var(--vscode-descriptionForeground)">${execReport.tasksCreated} task${execReport.tasksCreated === 1 ? '' : 's'} created across ${execReport.storiesSuccess} ${execReport.storiesSuccess === 1 ? 'story' : 'stories'} in ${esc(profile)}</span>
  </div>
  ${stories}
</div>`;
	return page('Atomize: Generate — Done', body, SWITCH_MODE_SCRIPT);
}

export function renderGenerateLivePartial(
	dryReport: GenerateReport,
	execReport: GenerateReport,
	mode: 'default' | 'compact',
	fileName: string,
	profile: string,
): string {
	const shortFile = fileName.split(/[/\\]/).pop() ?? fileName;
	const header = panelHeader(mode, true, shortFile, profile, execReport.templateName);
	const collapsed = collapsedDryRun(dryReport);
	const stories = mode === 'default'
		? execReport.results.map(execStoryResult).join('')
		: execReport.results.map(execStoryResultCompact).join('');
	const body = `${header}${collapsed}
<div style="border-top:1px solid var(--vscode-panel-border,#3d3d3d);margin-bottom:14px"></div>
<div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
    <span class="partial-badge">PARTIAL</span>
    <span style="font-size:.82em;color:var(--vscode-descriptionForeground)">${execReport.tasksCreated} task${execReport.tasksCreated === 1 ? '' : 's'} created · ${execReport.storiesFailed} ${execReport.storiesFailed === 1 ? 'story' : 'stories'} failed</span>
  </div>
  ${stories}
</div>`;
	return page('Atomize: Generate — Done', body, SWITCH_MODE_SCRIPT);
}
