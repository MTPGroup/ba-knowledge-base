import { auth } from '@/lib/auth'
import { createMiddleware } from 'hono/factory'

export const betterAuth = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session) {
    c.set('session', null)
    return next()
  }

  c.set('session', session)
  return next()
})
