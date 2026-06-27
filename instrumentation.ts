/**
 * Next.js instrumentation hook. `register()` runs once when a server instance boots,
 * including in the production standalone image (which watchtower auto-deploys). We use it
 * to run idempotent startup seeds so a deploy "just runs" the required data changes once.
 *
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  // Only the Node.js server runtime can use Prisma (not the edge runtime), and only run in
  // production so local `next dev` against the shared database doesn't trigger seeds.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV !== 'production') return

  try {
    const { ensureStartupAirfields } = await import('@/lib/seed/ensure-startup-airfields')
    await ensureStartupAirfields()
    console.log('[startup-seed] Startup airfield seed complete.')
  } catch (err) {
    // Never block server startup on a seed failure.
    console.error('[startup-seed] Failed to ensure startup airfields:', err)
  }
}
