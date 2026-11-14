import { spawnSync } from 'node:child_process';
const result=spawnSync(process.execPath,['--env-file-if-exists=.env','--test','tests/finance-integration.test.mjs'],{stdio:'inherit',env:{...process.env,RUN_FINANCE_INTEGRATION:'1'}});
process.exitCode=result.status??1;
