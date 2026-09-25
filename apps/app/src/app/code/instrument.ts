import { parse } from 'acorn';
import { generate } from 'astring';

/** Hooks the instrumented code calls: on entering a function, before every statement inside it, and on leaving it. */
export const TRACE_HOOK = '__grasp_trace';
export const ENTER_HOOK = '__grasp_enter';
export const EXIT_HOOK = '__grasp_exit';
export const PAUSE_HOOK = '__grasp_pause';
/** Each instrumented function keeps the frame its entry returned in this constant, and passes it to the other hooks. */
const FRAME = '__grasp_frame';

type AnyNode = { type: string; loc?: { start: { line: number } } } & Record<string, any>;

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const LOOP_TYPES = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);
const ANONYMOUS = '(anonymous)';

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

const identifier = (name: string): AnyNode => ({ type: 'Identifier', name });
const literal = (value: string | number | boolean): AnyNode => ({ type: 'Literal', value });
const call = (callee: string, args: AnyNode[]): AnyNode => ({
  type: 'CallExpression',
  callee: identifier(callee),
  arguments: args,
  optional: false,
});

function traceCall(line: number, names: string[]): AnyNode {
  const getters = names.map((name) => ({
    type: 'ArrayExpression',
    elements: [
      literal(name),
      { type: 'ArrowFunctionExpression', params: [], body: identifier(name), expression: true, async: false, generator: false },
    ],
  }));
  return {
    type: 'ExpressionStatement',
    expression: call(TRACE_HOOK, [identifier(FRAME), literal(line), { type: 'ArrayExpression', elements: getters }]),
  };
}

/** The name a stack trace would show: the binding, property or method the function is assigned to. */
function keyName(key: AnyNode | undefined, computed?: boolean): string | undefined {
  if (!key || computed) return undefined;
  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier') return key['name'];
  if (key.type === 'Literal') return String(key['value']);
  return undefined;
}

/** `sort`, `nums.map` or `Array.from`: a callee short enough to name the callback passed to it. */
function calleeName(callee: AnyNode): string | undefined {
  if (callee.type === 'Identifier') return callee['name'];
  if (callee.type !== 'MemberExpression' || callee['computed']) return undefined;
  const object = calleeName(callee['object']) ?? (callee['object'].type === 'ThisExpression' ? 'this' : undefined);
  const name = object ? `${object}.${callee['property'].name}` : callee['property'].name;
  return name.length > 24 ? callee['property'].name : name;
}

function nameHint(parent: AnyNode, key: string, className?: string): string | undefined {
  switch (parent.type) {
    case 'VariableDeclarator':
      return key === 'init' ? keyName(parent['id']) : undefined;
    case 'AssignmentExpression': {
      if (key !== 'right') return undefined;
      const left = parent['left'];
      return left.type === 'MemberExpression' ? keyName(left['property'], left['computed']) : keyName(left);
    }
    case 'MethodDefinition':
      if (parent['kind'] === 'constructor') return key === 'value' && className ? `new ${className}` : undefined;
      return key === 'value' ? keyName(parent['key'], parent['computed']) : undefined;
    case 'Property':
    case 'PropertyDefinition':
      return key === 'value' ? keyName(parent['key'], parent['computed']) : undefined;
    case 'CallExpression':
    case 'NewExpression': {
      const callee = key === 'arguments' ? calleeName(parent['callee']) : undefined;
      return callee ? `${callee} callback` : undefined;
    }
  }
  return undefined;
}

const unique = (names: string[]) => [...new Set(names)];

const asVar = (fn: AnyNode): AnyNode => ({
  type: 'VariableDeclaration',
  kind: 'var',
  declarations: [{ type: 'VariableDeclarator', id: fn['id'], init: { ...fn, type: 'FunctionExpression', id: null } }],
});

class Instrumenter {
  /** Visible names at the current point, innermost scope last; null outside any function. */
  private scopes: string[][] | null = null;
  private className: string | undefined;

  instrumentFunction(fn: AnyNode, hint?: string) {
    const outer = this.scopes;
    const params = fn['params'].flatMap((p: AnyNode) => patternNames(p));
    this.scopes = [...(outer ?? []), unique([...params, ...hoistedVars(fn['body'])])];
    if (fn.type === 'ArrowFunctionExpression' && fn['expression']) {
      const line = fn['body'].loc?.start.line ?? fn.loc?.start.line ?? 1;
      fn['body'] = { type: 'BlockStatement', body: [{ type: 'ReturnStatement', argument: fn['body'], loc: { start: { line } } }] };
      fn['expression'] = false;
    }
    this.block(fn['body']);
    fn['body'] = this.framed(fn['body'], fn['id']?.name ?? hint ?? ANONYMOUS, params);
    this.scopes = outer;
  }

  /**
   * Reports the call on entry and its end in a `finally`, so a return or a throw from anywhere in the body leaves the
   * stack right. A directive prologue stays first, where it still counts. The body's function declarations become `var`s
   * set before its first statement: inside the `try` block they would be block-scoped, where a `var` of the same name, or
   * a second declaration in strict code, is a syntax error.
   */
  private framed(body: AnyNode, name: string, params: string[]): AnyNode {
    const statements: AnyNode[] = body['body'];
    const prologue = statements.findIndex((s) => typeof s['directive'] !== 'string');
    const directives = prologue === -1 ? statements : statements.slice(0, prologue);
    const rest = prologue === -1 ? [] : statements.slice(prologue);
    const enter = call(ENTER_HOOK, [literal(name), { type: 'ArrayExpression', elements: params.map(literal) }]);
    return {
      type: 'BlockStatement',
      body: [
        ...directives,
        { type: 'VariableDeclaration', kind: 'const', declarations: [{ type: 'VariableDeclarator', id: identifier(FRAME), init: enter }] },
        {
          type: 'TryStatement',
          block: {
            type: 'BlockStatement',
            body: [
              ...rest.filter((s) => s.type === 'FunctionDeclaration').map(asVar),
              ...rest.filter((s) => s.type !== 'FunctionDeclaration'),
            ],
          },
          handler: null,
          finalizer: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: call(EXIT_HOOK, [identifier(FRAME)]) }] },
        },
      ],
    };
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
      const skip = s.type === 'FunctionDeclaration' || s.type === 'EmptyStatement' || typeof s['directive'] === 'string' || !s.loc;
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

  /** Finds functions nested inside expressions (callbacks, IIFEs, methods) and instruments them. */
  private expression(node: AnyNode, hint?: string) {
    if (!node || typeof node !== 'object') return;
    if (FUNCTION_TYPES.has(node.type)) {
      this.instrumentFunction(node, hint);
      return;
    }
    if (this.scopes && (node.type === 'YieldExpression' || node.type === 'AwaitExpression')) {
      this.expression(node['argument']);
      const args = [identifier(FRAME), node['argument'] ?? identifier('undefined')];
      node['argument'] = call(PAUSE_HOOK, node['delegate'] ? [...args, literal(true)] : args);
      return;
    }
    const outerClass = this.className;
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') this.className = node['id']?.name ?? hint;
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue;
      const child = node[key];
      const childHint = nameHint(node, key, this.className);
      if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === 'string' && this.expression(c, childHint));
      else if (child && typeof child.type === 'string') this.expression(child, childHint);
    }
    this.className = outerClass;
  }

  program(program: AnyNode) {
    for (const s of program['body']) {
      if (FUNCTION_TYPES.has(s.type)) this.instrumentFunction(s);
      else this.expression(s);
    }
  }
}

/**
 * Rewrites JavaScript so that every function reports when it is entered and left, and, before each statement inside it,
 * the current line and a getter for every variable in scope. Getters for names still in their temporal dead zone throw
 * and are skipped by the hook, which keeps the rewrite simple and always correct.
 */
export function instrument(js: string): string {
  const program = parse(js, { ecmaVersion: 'latest', sourceType: 'script', locations: true }) as unknown as AnyNode;
  new Instrumenter().program(program);
  return generate(program as never);
}
