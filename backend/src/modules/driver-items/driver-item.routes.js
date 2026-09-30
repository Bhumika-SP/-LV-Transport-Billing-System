import { created, ok, paged } from '../../utils/response.js';

/**
 * Standard routes for a driver line-item resource:
 *   GET /           list (filters, pagination)
 *   GET /totals     ACTIVE totals per type
 *   POST /          create
 *   POST /:id/void  void with reason
 * Controllers are thin adapters to the service created by createDriverItemService().
 */
export function itemRoutes(
  router,
  { service, view, manage, listQuery, totalsQuery, createSchema, validate, idParam, voidSchema },
) {
  router.get('/', view, validate({ query: listQuery }), async (req, res) =>
    paged(res, await service.list(req.valid.query)),
  );
  router.get('/totals', view, validate({ query: totalsQuery }), async (req, res) =>
    ok(res, await service.totals(req.valid.query)),
  );
  router.post('/', manage, validate({ body: createSchema }), async (req, res) =>
    created(res, await service.create(req.valid.body, req.user, req)),
  );
  router.post(
    '/:id/void',
    manage,
    validate({ params: idParam, body: voidSchema }),
    async (req, res) =>
      ok(res, await service.void(req.valid.params.id, req.valid.body, req.user, req)),
  );
}
