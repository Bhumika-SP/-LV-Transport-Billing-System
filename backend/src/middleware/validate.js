/**
 * Validate request parts against Zod schemas.
 * Parsed (coerced, defaulted) values are exposed on `req.valid.{params,query,body}`;
 * Zod errors propagate to the central handler as VALIDATION_ERROR.
 *
 *   router.post('/', validate({ body: createSchema }), controller.create)
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid = req.valid ?? {};
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) {
        req.valid[part] = schemas[part].parse(req[part] ?? {});
      }
    }
    next();
  };
}
