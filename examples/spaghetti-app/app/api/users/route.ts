// This one is fine: RLS does the filtering, exactly per D-002.
export async function GET() {
  const rows = await db.rls.query('select * from users');
  return Response.json(rows);
}

declare const db: { rls: { query(sql: string): Promise<unknown[]> } };
