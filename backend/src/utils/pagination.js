/** Run a paginated findMany + count with the same `where`. */
export async function findPage(delegate, { where, orderBy, include, select, page, pageSize }) {
  const [items, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy,
      include,
      select,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    delegate.count({ where }),
  ]);
  return { items, total, page, pageSize };
}
