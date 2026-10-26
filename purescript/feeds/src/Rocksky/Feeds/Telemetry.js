import * as telemetry from '../../feeds/runtime/telemetry.js';
export const installHttp = app => () => app.use('*', telemetry.telemetry());
export const instrumentPool = pool => () => telemetry.instrumentPool(pool);
export const count = algo => status => () => telemetry.feedRequestCounter.add(1, {algo, status});
export const measureImpl = algo => publisher => limit => paginated => authenticated => action => () =>
  telemetry.tracer.startActiveSpan('app.rocksky.feed.getFeedSkeleton', {
    attributes: {'feed.algo': algo, 'feed.publisher': publisher, 'feed.limit': limit,
      'feed.paginated': paginated, 'feed.authenticated': authenticated}
  }, async span => {
    const started = performance.now();
    try {
      const body = await action();
      span.setAttribute('feed.items', body.feed.length);
      telemetry.feedItemsReturned.record(body.feed.length, {algo});
      telemetry.feedRequestCounter.add(1, {algo, status: 'ok'});
      return body;
    } catch (error) {
      telemetry.recordError(span, error);
      telemetry.feedRequestCounter.add(1, {algo, status: 'error'});
      console.error(`Feed ${algo} failed:`, error.message);
      throw error;
    } finally {
      telemetry.feedRequestDuration.record((performance.now() - started) / 1000, {algo});
      span.end();
    }
  });
