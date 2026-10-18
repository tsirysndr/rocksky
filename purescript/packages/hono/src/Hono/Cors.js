import { cors as honoCors } from "hono/cors";
export const cors = (app) => () => {
  app.use(honoCors());
};
