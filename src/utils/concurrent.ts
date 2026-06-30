/**
 * Run `fn` over `items` with at most `limit` promises in flight. Calls `onSettled`
 * as each item settles (so a UI can update that row immediately). Never rejects —
 * a per-item failure is passed to `onSettled(item, index, undefined, error)`.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onSettled?: (item: T, index: number, result: R | undefined, error: unknown) => void,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const result = await fn(items[i], i);
        onSettled?.(items[i], i, result, undefined);
      } catch (err) {
        onSettled?.(items[i], i, undefined, err);
      }
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
}
