import { type Alias, Document, isAlias, isMap, isScalar, isSeq, type Node, parseDocument, visit } from "yaml";

interface Indentation {
  indent: number;
  indentSeq: boolean;
}

/**
 * An Atomize YAML File held as its YAML document (see CONTEXT.md, Template Document), so a new value can
 * be written back without losing what the plain parsed object drops: anchors and aliases, comments,
 * quoting, key order and indentation.
 *
 * `withValue` changes only what differs: Tasks are matched by `id` (else `title`), so a Task keeps its
 * comment even when it moves, and an alias keeps pointing at its anchor while the new value still
 * matches it. A document whose value didn't change serializes as its original text. Atomize reads
 * YAML 1.2, so a merge key (`<<`) is an ordinary key and is kept as written.
 */
export class TemplateDocument {
  private constructor(
    private readonly doc: Document,
    /** The text this document was parsed from, while its value hasn't changed. */
    private readonly sourceText: string | undefined,
    private readonly indentation: Indentation,
  ) {}

  /** Parses Atomize YAML File text, throwing the first YAML error, as `yaml.parse` does. */
  static parse(text: string): TemplateDocument {
    const doc = parseDocument(text);
    const [error] = doc.errors;
    if (error) throw error;
    return new TemplateDocument(doc, text, detectIndentation(text));
  }

  /** A document for a value with no source text yet, such as a new Template. */
  static create(value: unknown): TemplateDocument {
    return new TemplateDocument(new Document(value), undefined, { indent: 2, indentSeq: true });
  }

  /** The document's content as plain values, with aliases resolved. */
  toValue(): unknown {
    return this.doc.toJS();
  }

  /** A document holding `value`, keeping this document's anchors, aliases and comments wherever they still apply. */
  withValue(value: unknown): TemplateDocument {
    if (deepEqual(this.toValue(), value)) return this;
    const doc = this.doc.clone();
    const aliases = new Map<Alias, unknown>();
    doc.contents = merge(doc, doc.contents, value, aliases) as typeof doc.contents;
    expandStaleAliases(doc, aliases);
    return new TemplateDocument(doc, undefined, this.indentation);
  }

  toString(): string {
    return this.sourceText ?? this.doc.toString(this.indentation);
  }
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
 * Keeps an alias (`*name`) only where its anchor still comes before it and still reads as the new
 * value, so a shared condition stays shared. Any other alias is written out in full.
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

/** Whether an existing sequence item is the same item as a new one: same Task `id` or `title`, or same scalar. */
function sameItem(node: unknown, value: unknown): boolean {
  if (isScalar(node)) return node.value === value;
  if (!isMap(node) || !isPlainObject(value)) return false;
  if (value.id !== undefined && node.get("id") !== undefined) return node.get("id") === value.id;
  return value.title !== undefined && node.get("title") === value.title;
}

function detectIndentation(text: string): Indentation {
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
