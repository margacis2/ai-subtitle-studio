import { GET } from "../src/app/api/diagnostics/audio/route";

async function testDiag() {
  const res = await GET();
  const data = await res.json();
  console.log("Overall status:", data.overall, `(${data.passedCount}/${data.totalCount})`);
  for (const s of data.steps) {
    console.log(`[${s.status}] ${s.name}: ${s.details}`);
    if (s.error) console.log(`      Error: ${s.error}`);
  }
}

testDiag().catch(console.error);

