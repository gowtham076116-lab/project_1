import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, adminProcedure, router } from "./_core/trpc";
import { HIVE_ADMIN_COOKIE } from "./adminAuth";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Dedicated Admin API
  admin: router({
    me: publicProcedure.query(({ ctx }) => {
      return ctx.adminUser;
    }),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(HIVE_ADMIN_COOKIE, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      return { success: true };
    }),

    profile: adminProcedure.query(({ ctx }) => {
      return ctx.adminUser;
    }),
  }),
});

export type AppRouter = typeof appRouter;
