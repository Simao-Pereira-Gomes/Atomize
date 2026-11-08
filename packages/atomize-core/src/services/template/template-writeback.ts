import { type Alias, type Document, isAlias, isMap, isScalar, isSeq, type Node, parseDocument, visit } from "yaml";
import type { TaskTemplate } from "../../templates/schema";

/**
 * Writes a Template Improvement back onto the Template's own YAML text. Unchanged content keeps its
 * comments, quoting, key order, and indentation; Tasks are matched by `id` (else `title`) so a Task
 * keeps its comment even when it moves, and an alias keeps pointing at its anchor while the proposal
 * still matches it. A proposal that changes nothing returns the text untouched.
 */
export function applyProposalToYaml(sourceYaml: string, proposal: TaskTemplate): string {
  const doc = parseDocument(sourceYaml);
  if (deepEqual(doc.toJS(), proposal)) return sourceYaml;
  const aliases = new Map<Alias, unknown>();
  doc.contents = merge(doc, doc.contents, proposal, aliases) as typeof doc.contents;
  expandStaleAliases(doc, aliases);
  return doc.toString(detectIndentation(sourceYaml));
}

/**
 * The Template that "Save as new" writes: named as improved, with `origin` pointing at the source
 * when it is a Catalog item, and none for a standalone file (ADR-0010, ADR-0037).
 */
export function deriveImprovedCopy(proposal: TaskTemplate, source: { catalogRef?: string }): TaskTemplate {
  const { origin: _origin, ...rest } = proposal;
  return {
    ...rest,
    name: `${proposal.name} (improved)`,
    ...(source.catalogRef ? { origin: source.catalogRef } : {}),
  } as TaskTemplate;
}

function merge(doc: Document, node: unknown, value: unknown, aliases: Map<Alias, unknown>): Node {
  // Whether an alias can stay is only known once the whole document is merged (its anchor may be
  // edited, moved, or dropped later in the walk), so record what it should read as for now.
  if (isAlias(node)) {
    aliases.set(node, value);
    return node;
  }

  if (isPlainObject(value) && isMap(node)) {
    for (const pair of [...node.items]) {
      const key = isScalar(pair.key) ? pair.key.value : pair.key;
      if (typeof key === "string" && value[key] === undefined) node.delete(pair.key);
    }
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) continue;
      const existing = node.get(key, true);
      node.set(key, existing === undefined ? doc.createNode(child) : merge(doc, existing, child, aliases));
    }
    return node;
  }

  if (Array.isArray(value) && isSeq(node)) {
    // The parser files a comment above the first item on the sequence itself; give it to that item
    // so it stays with its Task if the Tasks are reordered.
    const first = node.items[0];
    if (node.commentBefore && (isMap(first) || isSeq(first)) && !first.commentBefore) {
      first.commentBefore = node.commentBefore;
      node.commentBefore = undefined;
    }
    const unused = [...node.items];
    node.items = value.map((item) => {
      const index = unused.findIndex((candidate) => sameItem(candidate, item));
      if (index < 0) return doc.createNode(item);
      const [match] = unused.splice(index, 1);
      return merge(doc, match, item, aliases);
    });
    return node;
  }

  if (isScalar(node) && !isPlainObject(value) && !Array.isArray(value)) {
    if (node.value !== value) node.value = value;
    return node;
  }

  return doc.createNode(value);
}

/**
 * Keeps an alias (`*name`) only where its anchor still comes before it and still reads as the
 * proposed value, so a shared condition stays shared. Any other alias is written out in full.
 */
function expandStaleAliases(doc: Document, aliases: Map<Alias, unknown>): void {
  if (aliases.size === 0) return;
  const anchors = new Map<string, Node>();
  visit(doc, {
    Node(_key, node) {
      if (!isAlias(node)) {
        if (node.anchor) anchors.set(node.anchor, node);
        return undefined;
      }
      if (!aliases.has(node)) return undefined;
      const value = aliases.get(node);
      const target = anchors.get(node.source);
      return target && deepEqual(target.toJS(doc), value) ? undefined : doc.createNode(value);
    },
  });
}

/** Whether an existing sequence item is the same item as a proposed one: same Task `id` or `title`, or same scalar. */
function sameItem(node: unknown, value: unknown): boolean {
  if (isScalar(node)) return node.value === value;
  if (!isMap(node) || !isPlainObject(value)) return false;
  if (value.id !== undefined && node.get("id") !== undefined) return node.get("id") === value.id;
  return value.title !== undefined && node.get("title") === value.title;
}

function detectIndentation(text: string): { indent: number; indentSeq: boolean } {
  const lines = text.split(/\r?\n/);
  const firstIndented = lines.find((line) => /^ +\S/.test(line) && !line.trimStart().startsWith("#"));
  const indent = firstIndented ? firstIndented.length - firstIndented.trimStart().length : 2;
  // Block sequences written flush with their key ("tasks:\n- title") mean indentSeq is off.
  const flushSequence = lines.some((line, i) => /^\S[^#]*:\s*$/.test(line) && /^- /.test(lines[i + 1] ?? ""));
  return { indent, indentSeq: !flushSequence };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((key) => a[key] !== undefined || b[key] !== undefined));
    return [...keys].every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}
