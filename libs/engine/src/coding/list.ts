export class ListNode {
  val: number;
  next: ListNode | null;

  constructor(val = 0, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}

/** A singly linked list of the values in order, or null for none. */
export function buildList(values: readonly number[]): ListNode | null {
  let head: ListNode | null = null;
  for (let i = values.length - 1; i >= 0; i--) head = new ListNode(values[i], head);
  return head;
}

/** Anything shaped like a list node: the runner's nodes, a learner's own class, or plain objects. */
export function isListNode(value: unknown): value is { val: unknown; next: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'val' in value && 'next' in value;
}

const kindOf = (value: unknown) => (Array.isArray(value) ? 'an array' : `a value of type ${typeof value}`);

/**
 * The values from head to the end, where a missing link (null or undefined) ends the list, as None does in Python. A list
 * that comes back to a node it passed has no end, and anything else in place of a node is not a list, so both are errors.
 */
export function listValues(head: unknown): unknown[] {
  if (head != null && !isListNode(head)) throw new Error(`Return the head ListNode (or null/None), not ${kindOf(head)}.`);
  const values: unknown[] = [];
  const seen = new Set<object>();
  for (let node: unknown = head; node != null; node = node.next) {
    if (!isListNode(node)) throw new Error(`A next link must be a ListNode or null/None, not ${kindOf(node)}.`);
    if (seen.has(node))
      throw new Error(`The returned list loops: after ${values.length} nodes it comes back to a node with value ${String(node.val)}.`);
    seen.add(node);
    values.push(node.val);
  }
  return values;
}
