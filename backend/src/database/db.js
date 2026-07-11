const fs = require('fs/promises');
const path = require('path');

let sql;
let neonClientFactory;

const DEFAULT_JSON_DB = {
  meta: {
    name: 'convergence-backend',
    source: 'local-json',
    createdAt: null,
    updatedAt: null,
  },
  agents: [],
  field_workers: [],
  cases: [],
  managers: [],
};

function getJsonDbPath() {
  return process.env.JSON_DB_PATH || path.join(__dirname, 'data.json');
}

function getPrimaryDbSource() {
  return (process.env.DB_SOURCE || 'json').toLowerCase();
}

async function ensureJsonDb() {
  const filePath = getJsonDbPath();

  try {
    await fs.access(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }

    const now = new Date().toISOString();
    const initialData = {
      ...DEFAULT_JSON_DB,
      meta: {
        ...DEFAULT_JSON_DB.meta,
        createdAt: now,
        updatedAt: now,
      },
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(initialData, null, 2)}\n`);
  }

  return filePath;
}

async function readJsonDb() {
  const filePath = await ensureJsonDb();
  const file = await fs.readFile(filePath, 'utf8');
  return JSON.parse(file);
}

async function writeJsonDb(data) {
  const filePath = getJsonDbPath();
  const nextData = {
    ...data,
    meta: {
      ...(data.meta || {}),
      source: 'local-json',
      updatedAt: new Date().toISOString(),
    },
  };
  const tempPath = `${filePath}.tmp`;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(nextData, null, 2)}\n`);
  await fs.rename(tempPath, filePath);

  return nextData;
}

async function updateJsonDb(updater) {
  const currentData = await readJsonDb();
  const nextData = (await updater(currentData)) || currentData;
  return writeJsonDb(nextData);
}

async function testJsonDbConnection() {
  const data = await readJsonDb();
  const agentsCount = Array.isArray(data.agents) ? data.agents.length : 0;
  const workersCount = Array.isArray(data.field_workers) ? data.field_workers.length : 0;
  const casesCount = Array.isArray(data.cases) ? data.cases.length : 0;
  const managersCount = Array.isArray(data.managers) ? data.managers.length : 0;
  const totalCount = agentsCount + workersCount + casesCount + managersCount;

  return {
    source: 'local-json',
    path: getJsonDbPath(),
    records: totalCount,
    updatedAt: data.meta && data.meta.updatedAt,
  };
}

function getSql(options = {}) {
  const { required = false } = options;

  if (!process.env.DATABASE_URL) {
    if (required) {
      throw new Error('DATABASE_URL is not set. Add it to your .env file.');
    }
    return null;
  }

  if (!sql) {
    if (!neonClientFactory) {
      ({ neon: neonClientFactory } = require('@neondatabase/serverless'));
    }
    sql = neonClientFactory(process.env.DATABASE_URL);
  }

  return sql;
}

async function testSqlConnection() {
  const sqlClient = getSql({ required: true });
  const result = await sqlClient`SELECT NOW() AS now, version() AS version`;
  const row = result[0] || {};

  return {
    source: 'neon',
    now: row.now,
    version: row.version,
  };
}

async function testPrimaryDbConnection() {
  if (['neon', 'postgres', 'postgresql'].includes(getPrimaryDbSource())) {
    return testSqlConnection();
  }

  return testJsonDbConnection();
}

module.exports = {
  getJsonDbPath,
  getPrimaryDbSource,
  getSql,
  readJsonDb,
  writeJsonDb,
  updateJsonDb,
  testJsonDbConnection,
  testSqlConnection,
  testPrimaryDbConnection,
};
