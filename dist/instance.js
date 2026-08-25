/**
 * Instance lifecycle actions: shutdown_instance ends this GUI process;
 * restart_instance relaunches the exact invocation that booted it.
 *
 * The restart machinery is vendored from dshmarket (lib/restart.js +
 * lib/dsh-cli.js) where it was hardened against three real failures:
 * EADDRINUSE races (helper now waits for OUR port to go quiet — #177),
 * silent spawn failures (async "error" listener + bind verification,
 * diagnosis written to a tmp log — #177), and Windows detached spawns
 * getting no console (powershell -WindowStyle Hidden wrapper — #40).
 * Adaptation: we answer over RPC, not HTTP, so the port comes from the
 * --port argv flag instead of the request Host header.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
/** Real Node binary (Android linker64 edge case, as upstream). */
function nodeExecutable() {
    const a = process.argv0;
    return a && isAbsolute(a) && existsSync(a) ? a : process.execPath;
}
/** The exact boot invocation, replayed verbatim by the helper (as upstream). */
function dshArgv() {
    const entry = process.argv[1];
    if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
        const abs = resolve(entry);
        return { file: nodeExecutable(), args: [...process.execArgv, abs], cwd: dirname(abs), viaShell: false };
    }
    // Bare `dsh` is a .cmd shim on Windows that only a shell can start (#13).
    return { file: "dsh", args: [], viaShell: process.platform === "win32" };
}
/** systemd's KillMode would take the detached helper down with us (#229). */
function detectedSupervisor() {
    if (process.platform !== "linux")
        return null;
    const env = process.env;
    return (env.INVOCATION_ID || env.JOURNAL_STREAM) && process.ppid === 1 ? "systemd" : null;
}
/** Our port from --port argv (RPC callers carry no Host header). */
export function servingPort(argv = process.argv) {
    const i = argv.indexOf("--port");
    const n = i >= 0 ? Number(argv[i + 1]) : NaN;
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}
/** Windows detached = DETACHED_PROCESS → console-less host pops visible child windows (#40). */
function respawnInvocation(launch) {
    if (launch.viaShell || process.platform !== "win32") {
        return { file: launch.file, args: launch.args, shell: launch.viaShell, detached: true };
    }
    const q = (s) => `'${s.replace(/'/g, "''")}'`;
    return {
        file: "powershell.exe",
        args: ["-NoProfile", "-WindowStyle", "Hidden", "-Command",
            [`& ${q(launch.file)}`, ...launch.args.map(q)].join(" ")],
        shell: false,
        detached: false,
    };
}
/** Detached helper: wait for the port to free, start the replacement, VERIFY it bound. */
// ponytail: kept as a generated -e script exactly like upstream so the helper
// outlives this process; upgrading means re-diffing against dshmarket's
// restartHelperSource when it changes there.
function restartHelperSource(spawned, cwd, logs, port) {
    return [
        "const { spawn } = require('node:child_process')",
        "const fs = require('node:fs')",
        "const net = require('node:net')",
        `const file=${JSON.stringify(spawned.file)}`,
        `const args=${JSON.stringify(spawned.args)}`,
        `const cwd=${JSON.stringify(cwd)}`,
        `const shell=${JSON.stringify(spawned.shell)}`,
        `const detached=${JSON.stringify(spawned.detached)}`,
        `const logOut=${JSON.stringify(logs.out)}`,
        `const logErr=${JSON.stringify(logs.err)}`,
        `const port=${JSON.stringify(port)}`,
        "const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))",
        "const note=(l)=>{try{fs.appendFileSync(logErr,`[dsh-enhanced] ${l}\\n`)}catch{}}",
        "const listening=()=>new Promise((res)=>{const p=net.connect({host:'127.0.0.1',port});const done=v=>{p.destroy();res(v)};p.on('connect',()=>done(true));p.on('error',()=>done(false));setTimeout(()=>done(false),500)})",
        "const main=async()=>{",
        "  if(port){const until=Date.now()+30000;while(Date.now()<until&&await listening())await sleep(250);if(await listening())note(`port ${port} still in use after 30s; starting anyway`);await sleep(300)}else{await sleep(1500)}",
        "  let child;try{const out=fs.openSync(logOut,'a');const err=fs.openSync(logErr,'a');",
        "    child=spawn(file,args,{cwd,detached,stdio:['ignore',out,err],env:process.env,shell})",
        "    child.on('error',(e)=>note(`could not start the replacement: ${e&&e.message?e.message:e}`))",
        "    child.unref()}catch(e){note(`could not start the replacement: ${e&&e.message?e.message:e}`);return}",
        "  if(!port){await sleep(3000);return}",
        "  const upBy=Date.now()+20000;while(Date.now()<upBy&&!(await listening()))await sleep(500)",
        "  if(!(await listening()))note(`the replacement did not bind port ${port} within 20s - see the output log beside this one`)",
        "}",
        "main()",
    ].join("\n");
}
function scheduleSelfExit(ms) {
    setTimeout(() => process.kill(process.pid, "SIGTERM"), ms);
}
export const INSTANCE_ACTIONS = ["shutdown_instance", "restart_instance"];
export const handleInstance = async (action, _args, env) => {
    if (action === "shutdown_instance") {
        scheduleSelfExit(400); // let the RPC response flush first
        return { ok: true, shuttingDown: true };
    }
    if (action === "restart_instance") {
        const supervisor = detectedSupervisor();
        if (supervisor && env.allowRestart !== true) {
            return { error: `this host runs under ${supervisor}; it owns process restarts. Set allowRestart: true in the plugin config to override.` };
        }
        const base = dshArgv();
        if (!base.cwd)
            return { error: "could not determine how this instance was launched (no bin entry in argv)" };
        const launch = { ...base, args: [...base.args, ...process.argv.slice(2)] };
        const spawned = respawnInvocation(launch);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const logs = { out: join(tmpdir(), `dsh-enhanced-restart-${stamp}.out.log`), err: join(tmpdir(), `dsh-enhanced-restart-${stamp}.err.log`) };
        const helper = spawn(nodeExecutable(), ["-e", restartHelperSource(spawned, launch.cwd, logs, servingPort())], {
            detached: true,
            stdio: "ignore",
            env: process.env,
        });
        helper.unref();
        scheduleSelfExit(500);
        return { ok: true, restarting: true, helperPid: helper.pid, log: logs.err };
    }
    return null;
};
