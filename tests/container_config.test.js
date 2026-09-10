import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

console.log('[TEST] Starting Containerization & CI/CD Configuration Test Suite...\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

// 1. Verify Dockerfile Structure & Directives
console.log('Test 1: Dockerfile Multi-Stage Directives & Security Best Practices');
const dockerfilePath = path.join(root, 'Dockerfile');
assert(fs.existsSync(dockerfilePath), 'Dockerfile must exist');
const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

assert(dockerfile.includes('AS base'), 'Must declare base stage');
assert(dockerfile.includes('AS dependencies'), 'Must declare dependencies stage');
assert(dockerfile.includes('AS runner'), 'Must declare runner production stage');
assert(dockerfile.includes('node:22-alpine'), 'Must use minimal alpine runtime');
assert(dockerfile.includes('USER marketarena'), 'Must enforce non-root user execution');
assert(dockerfile.includes('HEALTHCHECK'), 'Must configure Docker HEALTHCHECK directive');
assert(dockerfile.includes('EXPOSE 3000'), 'Must expose port 3000');
assert(dockerfile.includes('npm ci --only=production'), 'Must isolate production dependencies');
console.log('[PASS] Dockerfile verified with multi-stage build, alpine base, non-root user, and healthcheck\n');

// 2. Verify .dockerignore Rules
console.log('Test 2: .dockerignore File Exclusions');
const dockerignorePath = path.join(root, '.dockerignore');
assert(fs.existsSync(dockerignorePath), '.dockerignore must exist');
const dockerignore = fs.readFileSync(dockerignorePath, 'utf8');

assert(dockerignore.includes('node_modules'), 'Must ignore node_modules');
assert(dockerignore.includes('.git'), 'Must ignore .git');
assert(dockerignore.includes('tests'), 'Must ignore test files in production container');
assert(dockerignore.includes('data/*.db'), 'Must ignore local sqlite databases');
console.log('[PASS] .dockerignore rules verified\n');

// 3. Verify docker-compose.yml Structure
console.log('Test 3: docker-compose.yml Orchestration Specification');
const composePath = path.join(root, 'docker-compose.yml');
assert(fs.existsSync(composePath), 'docker-compose.yml must exist');
const compose = fs.readFileSync(composePath, 'utf8');

assert(compose.includes('services:'), 'Must specify services block');
assert(compose.includes('marketarena:'), 'Must declare marketarena service');
assert(compose.includes('3000:3000'), 'Must map port 3000');
assert(compose.includes('./data:/app/data'), 'Must mount persistent data volume for SQLite');
assert(compose.includes('healthcheck:'), 'Must define compose healthcheck');
console.log('[PASS] docker-compose.yml verified\n');

// 4. Verify GitHub Actions CI Workflow
console.log('Test 4: GitHub Actions CI Workflow Configuration');
const ciWorkflowPath = path.join(root, '.github', 'workflows', 'ci.yml');
assert(fs.existsSync(ciWorkflowPath), 'CI workflow must exist at .github/workflows/ci.yml');
const ciWorkflow = fs.readFileSync(ciWorkflowPath, 'utf8');

assert(ciWorkflow.includes('branches: [ main ]'), 'Must trigger on main branch');
assert(ciWorkflow.includes('ubuntu-latest'), 'Must run on ubuntu-latest');
assert(ciWorkflow.includes('actions/checkout@v4'), 'Must checkout code');
assert(ciWorkflow.includes('actions/setup-node@v4'), 'Must setup Node.js');
assert(ciWorkflow.includes('actions/setup-python@v5'), 'Must setup Python for SDK verification');
assert(ciWorkflow.includes('npm run test:regression'), 'Must execute regression test suite');
assert(ciWorkflow.includes('npm test'), 'Must execute multi-round stress test suite');
console.log('[PASS] GitHub Actions CI workflow verified\n');

console.log('[SUCCESS] ALL CONTAINERIZATION & CI/CD CONFIGURATION TESTS PASSED!\n');
process.exit(0);
