// First-primary prevents stale reads of revoked accounts or licenses if read
// replication is enabled later. Every request uses one consistent D1 session.
export function d1Store(binding) {
  const db = binding.withSession('first-primary');
  return {
    prepare(sql) {
      return {
        get: (...values) => db.prepare(sql).bind(...values).first(),
        all: async (...values) => (await db.prepare(sql).bind(...values).all()).results,
        run: async (...values) => ({ changes: (await db.prepare(sql).bind(...values).run()).meta.changes })
      };
    }
  };
}
