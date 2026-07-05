// Month 3: this route was written by an agent that never saw D-002.
// It re-introduces exactly the manual filtering that decision banned.
export async function GET(req: { user: { id: string } }) {
  const rows = await db.query('select * from orders');
  const mine = rows.filter((r: { user_id: string }) => r.user_id === req.user.id);
  return Response.json(mine);
}

declare const db: { query(sql: string): Promise<unknown[]> };
