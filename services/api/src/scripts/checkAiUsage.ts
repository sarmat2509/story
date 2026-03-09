/**
 * Check ai_usage_events table - recent records and optionally by story_id
 * Run: cd services/api && npx tsx src/scripts/checkAiUsage.ts [storyId]
 * With Docker: pnpm api:script npx tsx src/scripts/checkAiUsage.ts d837a4c5-5f5d-4b29-86b4-e4f35f1ac5cb
 */

import { Pool } from 'pg';

async function checkAiUsage() {
  const storyId = process.argv[2];

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    let query: string;
    let params: string[] = [];

    if (storyId) {
      query = `
        SELECT id, user_id, story_id, provider, operation, model,
               input_units, output_units, cost_usd, duration_ms, metadata, created_at
        FROM ai_usage_events
        WHERE story_id = $1
        ORDER BY created_at ASC
      `;
      params = [storyId];
      console.log('\n📊 AI Usage Events for story:', storyId);
    } else {
      query = `
        SELECT id, user_id, story_id, provider, operation, model,
               input_units, output_units, cost_usd, duration_ms, metadata, created_at
        FROM ai_usage_events
        ORDER BY created_at DESC
        LIMIT 50
      `;
      console.log('\n📊 Last 50 AI Usage Events (use storyId as arg to filter)');
    }

    console.log('='.repeat(100));

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      console.log('No records found.');
      return;
    }

    let totalCost = 0;
    for (const row of result.rows) {
      const cost = parseFloat(row.cost_usd || '0');
      totalCost += cost;
      console.log(`
  ${row.created_at} | ${row.provider} | ${row.operation} | ${row.model || '-'}
    input: ${row.input_units ?? '-'} | output: ${row.output_units ?? '-'} | cost: $${cost.toFixed(6)}
    story: ${row.story_id || '-'} | user: ${row.user_id || '-'}
    ${row.metadata ? `metadata: ${JSON.stringify(row.metadata)}` : ''}
`);
    }

    console.log('='.repeat(100));
    console.log(`Total records: ${result.rows.length} | Total cost: $${totalCost.toFixed(6)}`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkAiUsage();
