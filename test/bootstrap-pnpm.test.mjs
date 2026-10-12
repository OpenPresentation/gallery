import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {bootstrapPnpmEnvironment} from '../scripts/bootstrap-pnpm.mjs';

test('temporary Corepack shim enables nested pnpm without an ambient pnpm and cleans up',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'gallery-pnpm-'));
 const env={...process.env,PATH:[path.dirname(process.execPath),...(process.platform==='win32'?[process.env.SystemRoot+'/System32']:['/usr/bin','/bin'])].join(path.delimiter)};
 const run=(args,environment)=>spawnSync(process.execPath,args,{cwd:directory,env:environment,encoding:'utf8'});
 try{
  writeFileSync(path.join(directory,'package.json'),JSON.stringify({packageManager:'pnpm@10.33.2',scripts:{nested:'pnpm --version'}}));
  // This is the hosted failure: package-manager subprocess lookup has no pnpm.
  const absent=run(['-e',"const r=require('node:child_process').spawnSync('pnpm',['--version']);if(r.error?.code==='ENOENT')process.exit(42);process.exit(1)"] ,env);
  assert.equal(absent.status,42,absent.stderr);
  const staged=bootstrapPnpmEnvironment(directory,env);
  assert.equal(env.PATH.split(path.delimiter).includes(path.join(directory,'bin')),false);
  const result=run(['-e',"const r=require('node:child_process').spawnSync('corepack',['pnpm','run','nested'],{stdio:'inherit'});process.exit(r.status??1)"],staged);
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/10\.33\.2/);
 }finally{rmSync(directory,{recursive:true,force:true});}
 assert.equal(existsSync(directory),false);
});
