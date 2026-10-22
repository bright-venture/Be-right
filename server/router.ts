import { authRouter } from "./auth-router";
import { requestsRouter } from "./requests-router";
import { specialistRouter } from "./specialist-router";
import { techRouter } from "./tech-router";
import { storageRouter } from "./storage-router";
import { joinRouter } from "./join-router";
import { reviewsRouter } from "./reviews-router";
import { adminRouter } from "./admin-router";
import { emergencyRouter } from "./emergency-router";
import { shopsRouter } from "./shops-router";
import { pricingRouter } from "./pricing-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  requests: requestsRouter,
  specialist: specialistRouter,
  tech: techRouter,
  storage: storageRouter,
  join: joinRouter,
  reviews: reviewsRouter,
  admin: adminRouter,
  emergency: emergencyRouter,
  shops: shopsRouter,
  pricing: pricingRouter,
});

export type AppRouter = typeof appRouter;
