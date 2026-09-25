import { parse } from 'acorn';
import { generate } from 'astring';

/**
 * Hooks the instrumented code calls: on entering a function, before each statement, on leaving it, at each `yield` or
 * `await`, and when a `yield` resumes.
 */
export const TRACE_HOOK = '__grasp_trace';
export const ENTER_HOOK = '__grasp_enter';
export const EXIT_HOOK = '__grasp_exit';
export const PAUSE_HOOK = '__grasp_pause';
export const RESUME_HOOK = '__grasp_resume';
/** Each instrumented function keeps the frame its entry returned in this constant, and passes it to the other hooks. */
const FRAME = '__grasp_frame';

type AnyNode = { type: string; loc?: { start: { line: number } } } & Record<string, any>;

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const LOOP_TYPES = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);
const ANONYMOUS = '(anonymous)';
const MAX_CALLEE = 24;

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
const array = (elements: AnyNode[]): AnyNode => ({ type: 'ArrayExpression', elements });
const block = (body: AnyNode[]): AnyNode => ({ type: 'BlockStatement', body });
const call = (callee: string, args: AnyNode[]): AnyNode => ({
  type: 'CallExpression',
  callee: identifier(callee),
  arguments: args,
  optional: false,
});

function traceCall(line: number, names: string[]): AnyNode {
  const getters = names.map((name) =>
    array([
      literal(name),
      { type: 'ArrowFunctionExpression', params: [], body: identifier(name), expression: true, async: false, generator: false },
    ]),
  );
  return { type: 'ExpressionStatement', expression: call(TRACE_HOOK, [identifier(FRAME), literal(line), array(getters)]) };
}

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
  const property: string = callee['property'].name;
  const object = calleeName(callee['object']) ?? (callee['object'].type === 'ThisExpression' ? 'this' : undefined);
  const name = object ? `${object}.${property}` : property;
  return name.length > MAX_CALLEE ? property : name;
}

/** The name a stack trace would show: the binding, property, method or callee the function is passed to. */
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

const isDirective = (statement: AnyNode) => typeof statement['directive'] === 'string';

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
      fn['body'] = block([{ type: 'ReturnStatement', argument: fn['body'], loc: { start: { line } } }]);
      fn['expression'] = false;
    }
    this.block(fn['body']);
    fn['body'] = this.framed(fn['body'], fn['id']?.name ?? hint ?? ANONYMOUS, params);
    this.scopes = outer;
  }

  /**
   * Exit runs in a `finally`, so returns and throws unwind the stack. Directives stay first to keep their effect. Top-level
   * function declarations become `var`s at the top of the `try`: as block-scoped declarations there, a same-named `var` or
   * a strict-mode redeclaration is a syntax error.
   */
  private framed(body: AnyNode, name: string, params: string[]): AnyNode {
    const statements: AnyNode[] = body['body'];
    const prologue = statements.findIndex((s) => !isDirective(s));
    const split = prologue === -1 ? statements.length : prologue;
    const directives = statements.slice(0, split);
    const rest = statements.slice(split);
    const enter = call(ENTER_HOOK, [literal(name), array(params.map(literal))]);
    return block([
      ...directives,
      { type: 'VariableDeclaration', kind: 'const', declarations: [{ type: 'VariableDeclarator', id: identifier(FRAME), init: enter }] },
      {
        type: 'TryStatement',
        block: block([
          ...rest.filter((s) => s.type === 'FunctionDeclaration').map(asVar),
          ...rest.filter((s) => s.type !== 'FunctionDeclaration'),
        ]),
        handler: null,
        finalizer: block([{ type: 'ExpressionStatement', expression: call(EXIT_HOOK, [identifier(FRAME)]) }]),
      },
    ]);
  }

  private visible(): string[] {
    return unique((this.scopes ?? []).flat());
  }

  private block(node: AnyNode) {
    this.scopes!.push(blockNames(node['body']));
    node['body'] = this.statements(node['body']);
    this.scopes!.pop();
  }

  private statements(list: AnyNode[]): AnyNode[] {
    return list.flatMap((s) => {
      this.statement(s);
      const skip = s.type === 'FunctionDeclaration' || s.type === 'EmptyStatement' || isDirective(s) || !s.loc;
      return skip ? [s] : [traceCall(s.loc!.start.line, this.visible()), s];
    });
  }

  /** Wraps a single-statement body (`if (x) y;`) in a block so it can be traced like any other. */
  private asBlock(node: AnyNode): AnyNode {
    return node.type === 'BlockStatement' ? node : block([node]);
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

  /**
   * Instruments functions nested in expressions, naming each from its context, and routes `yield` and `await` through the
   * pause hook. A resumed `yield` goes through the resume hook, so calls in the rest of its expression nest under the generator.
   */
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
      if (node.type === 'YieldExpression') {
        const yielded = { ...node };
        for (const key of Object.keys(node)) delete node[key];
        Object.assign(node, call(RESUME_HOOK, [identifier(FRAME), yielded]));
      }
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
