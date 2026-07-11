const seedData = require('./seedData.json');
const { writeJsonDb, testJsonDbConnection } = require('./db');

async function seedJsonDb() {
  const createdAt = seedData.meta && seedData.meta.createdAt
    ? seedData.meta.createdAt
    : new Date().toISOString();

  await writeJsonDb({
    meta: {
      name: 'convergence-backend',
      createdAt,
    },
    agents: seedData.agents || [],
    field_workers: seedData.field_workers || [],
    cases: seedData.cases || [],
    managers: seedData.managers || [],
  });

  const result = await testJsonDbConnection();
  console.log(`Seeded ${result.records} records into ${result.path}`);
}

seedJsonDb().catch((err) => {
  console.error('Failed to seed JSON database:', err.message);
  process.exit(1);
});
