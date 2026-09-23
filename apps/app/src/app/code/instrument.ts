import { parse } from 'acorn';
import { generate } from 'astring';

/** Name of the hook the instrumented code calls before every statement inside a function. */
export const TRACE_HOOK = '__grasp_trace';

type AnyNode = { type: string; loc?: { start: { line: number } } } & Record<string, any>;

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const LOOP_TYPES = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);

function patternNames(pattern: AnyNode | null, out: string[] = []): string[] {
  if (!pattern) return out;
  switch (pattern.type) {
    case 'Identifier':
      out.push(pattern['name']);
      break;
    case 'ArrayPattern':
      pattern['elements'].forEach((el: AnyNode | null) => patternNames(el, out));
      break;
    case 'ObjectPattern':
      pattern['properties'].forEach((p: AnyNode) => patternNames(p.type === 'RestElement' ? p['argument'] : p['value'], out));
      break;
    case 'RestElement':
      patternNames(pattern['argument'], out);
      break;
    case 'AssignmentPattern':
      patternNames(pattern['left'], out);
      break;
  }
  return out;
}

/** `var` declarations anywhere in a function body (they are function-scoped), not descending into nested functions. */
function hoistedVars(node: AnyNode, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'VariableDeclaration' && node['kind'] === 'var')
    node['declarations'].forEach((d: AnyNode) => patternNames(d['id'], out));
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === 'string' && !FUNCTION_TYPES.has(c.type) && hoistedVars(c, out));
    else if (child && typeof child.type === 'string' && !FUNCTION_TYPES.has(child.type)) hoistedVars(child, out);
  }
  return out;
}

/** Block-scoped names declared directly in a statement list. */
function blockNames(statements: AnyNode[]): string[] {
  const out: string[] = [];
  for (const s of statements) {
    if (s.type === 'VariableDeclaration' && s['kind'] !== 'var') s['declarations'].forEach((d: AnyNode) => patternNames(d['id'], out));
    else if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s['id']) out.push(s['id'].name);
  }
  return out;
}

function traceCall(line: number, names: string[]): AnyNode {
  const getters = names.map((name) => ({
    type: 'ArrayExpression',
    elements: [
      { type: 'Literal', value: name },
      { type: 'ArrowFunctionExpression', params: [], body: { type: 'Identifier', name }, expression: true, async: false, generator: false },
    ],
  }));
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: TRACE_HOOK },
      arguments: [
        { type: 'Literal', value: line },
        { type: 'ArrayExpression', elements: getters },
      ],
      optional: false,
    },
  };
}

const unique = (names: string[]) => [...new Set(names)];

class Instrumenter {
  /** Visible names at the current point, innermost scope last; null outside any function. */
  private scopes: string[][] | null = null;

  instrumentFunction(fn: AnyNode) {
    const outer = this.scopes;
    const params = fn['params'].flatMap((p: AnyNode) => patternNames(p));
    this.scopes = [...(outer ?? []), unique([...params, ...hoistedVars(fn['body'])])];
    if (fn.type === 'ArrowFunctionExpression' && fn['expression']) {
      const line = fn['body'].loc?.start.line ?? fn.loc?.start.line ?? 1;
      fn['body'] = { type: 'BlockStatement', body: [{ type: 'ReturnStatement', argument: fn['body'], loc: { start: { line } } }] };
      fn['expression'] = false;
    }
    this.block(fn['body']);
    this.scopes = outer;
  }

  private visible(): string[] {
    return unique((this.scopes ?? []).flat());
  }

  private block(block: AnyNode) {
    this.scopes!.push(blockNames(block['body']));
    block['body'] = this.statements(block['body']);
    this.scopes!.pop();
  }

  private statements(list: AnyNode[]): AnyNode[] {
    return list.flatMap((s) => {
      this.statement(s);
      const skip = s.type === 'FunctionDeclaration' || s.type === 'EmptyStatement' || !s.loc;
      return skip ? [s] : [traceCall(s.loc!.start.line, this.visible()), s];
    });
  }

  /** Wraps a single-statement body (`if (x) y;`) in a block so it can be traced like any other. */
  private asBlock(node: AnyNode): AnyNode {
    return node.type === 'BlockStatement' ? node : { type: 'BlockStatement', body: [node] };
  }

  private statement(s: AnyNode) {
    switch (s.type) {
      case 'BlockStatement':
        this.block(s);
        return;
      case 'IfStatement':
        this.expression(s['test']);
        s['consequent'] = this.asBlock(s['consequent']);
        this.block(s['consequent']);
        if (s['alternate']) {
          s['alternate'] = this.asBlock(s['alternate']);
          this.block(s['alternate']);
        }
        return;
      case 'LabeledStatement':
        this.statement(s['body']);
        return;
      case 'SwitchStatement':
        this.expression(s['discriminant']);
        this.scopes!.push(blockNames(s['cases'].flatMap((c: AnyNode) => c['consequent'])));
        for (const c of s['cases']) c['consequent'] = this.statements(c['consequent']);
        this.scopes!.pop();
        return;
      case 'TryStatement':
        this.block(s['block']);
        if (s['handler']) {
          this.scopes!.push(patternNames(s['handler']['param']));
          this.block(s['handler']['body']);
          this.scopes!.pop();
        }
        if (s['finalizer']) this.block(s['finalizer']);
        return;
      default:
        if (LOOP_TYPES.has(s.type)) {
          const head = s['init'] ?? s['left'];
          const headNames =
            head?.type === 'VariableDeclaration' && head['kind'] !== 'var'
              ? head['declarations'].flatMap((d: AnyNode) => patternNames(d['id']))
              : [];
          this.scopes!.push(headNames);
          for (const key of ['init', 'test', 'update', 'left', 'right']) if (s[key]) this.expression(s[key]);
          s['body'] = this.asBlock(s['body']);
          this.block(s['body']);
          this.scopes!.pop();
          return;
        }
        this.expression(s);
    }
  }

  /** Finds functions nested inside expressions (callbacks, IIFEs) and instruments them. */
  private expression(node: AnyNode) {
    if (!node || typeof node !== 'object') return;
    if (FUNCTION_TYPES.has(node.type)) {
      this.instrumentFunction(node);
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === 'string' && this.expression(c));
      else if (child && typeof child.type === 'string') this.expression(child);
    }
  }

  program(program: AnyNode) {
    for (const s of program['body']) {
      if (FUNCTION_TYPES.has(s.type)) this.instrumentFunction(s);
      else this.expression(s);
    }
  }
}

/**
 * Rewrites JavaScript so that, before each statement inside a function, it reports the current line
 * and a getter for every variable in scope. Getters for names still in their temporal dead zone throw
 * and are skipped by the hook, which keeps the rewrite simple and always correct.
 */
export function instrument(js: string): string {
  const program = parse(js, { ecmaVersion: 'latest', sourceType: 'script', locations: true }) as unknown as AnyNode;
  new Instrumenter().program(program);
  return generate(program as never);
}
