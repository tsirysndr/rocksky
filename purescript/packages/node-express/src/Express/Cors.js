import corsMiddleware from "cors";
export const cors = (app) => () => {
  app.use(corsMiddleware());
};
