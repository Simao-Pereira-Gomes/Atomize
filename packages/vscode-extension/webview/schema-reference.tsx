import { buildSchemaTrees, type JsonSchema, type SchemaTab } from '@sppg2001/atomize-schema-reference';
import schema from '@sppg2001/atomize-schema-reference/schema.json';
import { SchemaReference } from '@sppg2001/atomize-schema-reference/viewer';
import { createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import '@sppg2001/atomize-schema-reference/styles.css';
import './schema-reference.css';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();
const root = document.getElementById('schema-reference');
if (!root) throw new Error('Schema Reference root is missing');

const trees = buildSchemaTrees(schema as JsonSchema);
const [destination, setDestination] = createSignal<{ tab: SchemaTab; permalink?: string }>({ tab: 'template' });
window.addEventListener('message', event => {
	const message = event.data;
	if (message?.type !== 'navigate' || (message.tab !== 'template' && message.tab !== 'mixin')) return;
	setDestination({ tab: message.tab, permalink: typeof message.permalink === 'string' ? message.permalink : undefined });
	if (!message.permalink) window.scrollTo({ top: 0, behavior: 'instant' });
});

render(() => (
	<Show when={destination()} keyed>
		{target => (
			<SchemaReference
				trees={trees}
				initialTab={target.tab}
				permalink={target.permalink}
				versionLabel={`Extension ${root.dataset.version}`}
				syncUrl={false}
				showPermalinks={false}
				guideUrl={anchor => `https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Template-Reference.md#${encodeURIComponent(anchor)}`}
				openExternalLink={url => { vscode.postMessage({ type: 'openGuide', url }); }}
			/>
		)}
	</Show>
), root);
vscode.postMessage({ type: 'ready' });
