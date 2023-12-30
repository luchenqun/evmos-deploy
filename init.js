import { HDNodeWallet } from "ethers";
import { ethToEvmos } from "@tharsis/address-converter";
import { exec } from "child_process";
import fs from "fs-extra";
import path from "path";
import os from "os";
import util from "util";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { privKeyToBurrowAddres, sleep } from "./utils.js";

let argv = yargs(hideBin(process.argv))
  .option("n", {
    alias: "nohup",
    demandOption: false,
    default: true,
    describe: "Whether the startup script is nohup",
    type: "bool",
  })
  .option("c", {
    alias: "compile",
    demandOption: false,
    default: false,
    describe: "Whether compile code",
    type: "bool",
  })
  .option("v", {
    alias: "validators",
    demandOption: false,
    default: 4,
    describe: "Number of validators to initialize the testnet with (default 4)",
    type: "number",
  })
  .option("cn", {
    alias: "commonNode",
    demandOption: false,
    default: 0,
    describe: "Number of common node to initialize the testnet with (default 0)",
    type: "number",
  })
  .option("p", {
    alias: "platform",
    demandOption: false,
    default: "",
    describe: "platform(darwin,linux,win32)",
    type: "string",
  })
  .option("s", {
    alias: "start",
    demandOption: false,
    default: false,
    describe: "Whether after initialize immediate start",
    type: "bool",
  })
  .option("k", {
    alias: "keep",
    demandOption: false,
    default: false,
    describe: "Whether keep the data",
    type: "bool",
  })
  .number(["v"])
  .number(["cn"])
  .boolean(["n", "c", "s", "k"]).argv;

const isNohup = argv.nohup;
const isStart = argv.start;
const isCompile = argv.compile;
const isKeep = argv.keep;
const commonNode = argv.commonNode;
const validators = argv.validators;
const nodesCount = validators + commonNode;
const platform = argv.platform ? argv.platform : process.platform;
const arch = os.arch();
const execPromis = util.promisify(exec);
const curDir = process.cwd();
const nodesDir = path.join(curDir, "nodes");
const polard = platform == "win32" ? "polard.exe" : "polard";
let chainId = "polaris-2061";
let clientCfg = `
# The network chain ID
chain-id = "${chainId}"
# The keyring's backend, where the keys are stored (os|file|kwallet|pass|test|memory)
keyring-backend = "test"
# CLI output format (text|json)
output = "text"
# <host>:<port> to Tendermint RPC interface for this chain
node = "tcp://localhost:26657"
# Transaction broadcasting mode (sync|async)
broadcast-mode = "sync"
`;
const scriptStop = path.join(nodesDir, platform == "win32" ? "stopAll.vbs" : "stopAll.sh");
const scriptStart = path.join(nodesDir, platform == "win32" ? "startAll.vbs" : "startAll.sh");

const updatePorts = (data, ports, index) => {
  let lines = data.split(/\r?\n/);
  for (const key in ports) {
    let [k1, k2] = key.split("."); // key for example "api.address"
    let port = ports[key];
    let find = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      //  for example: [json-rpc]
      if (line.startsWith(`[${k1}]`)) {
        find = true;
      }
      //for example: "tcp://0.0.0.0:1317"
      if (find && line.startsWith(`${k2} = `)) {
        const oldPort = line.split(":").pop().split(`"`)[0];
        const newPort = String(port + index);
        // console.log(line, oldPort, newPort);
        lines[i] = line.replace(oldPort, newPort).replace("localhost", "0.0.0.0").replace("127.0.0.1", "0.0.0.0");
        break;
      }
    }
  }
  return lines.join("\n");
};

const updateCfg = (data, cfg) => {
  let lines = data.split(/\r?\n/);
  for (const key in cfg) {
    let find = true;
    let k1;
    let k2 = key;
    if (key.indexOf(".") > 0) {
      [k1, k2] = key.split(".");
      find = false;
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!find && line.startsWith(`[${k1}]`)) {
        find = true;
      }
      if (find && line.startsWith(`${k2} = `)) {
        lines[i] = `${k2} = ${cfg[key]}`;
        break;
      }
    }
  }
  return lines.join("\n");
};

let init = async function () {
  console.log("argv:", JSON.stringify(argv), "platform:", platform, ", arch:", arch);
  try {
    if (!fs.existsSync("./config.json")) {
      await fs.copyFile("./config.default.json", "./config.json");
    }

    let config = await fs.readJson("./config.json");
    const { app, tendermint, preMinePerAccount, fixedFirstValidator, preMineAccounts, privateKeys } = config;
    if (app.chain_id) {
      clientCfg = clientCfg.replaceAll(chainId, app.chain_id);
      chainId = app.chain_id;
    }

    if (await fs.pathExists(scriptStop)) {
      console.log("Try to stop the polard under the nodes directory");
      await execPromis(scriptStop, { cwd: nodesDir }); // Anyway, stop it first
      await sleep(platform == "win32" ? 600 : 300);
    }

    if (!fs.existsSync(polard) || isCompile) {
      console.log("Start recompiling polard...");
      let make = await execPromis("go build ../polard", { cwd: curDir });
      console.log("polard compile finished", make);
    }

    if (!fs.existsSync(polard)) {
      console.log("polard Executable file does not exist");
      return;
    }

    if (validators < 1) {
      console.log("validators >= 1");
      return;
    }
    if (!isKeep) {
      console.log("Start cleaning up folder nodes");
      await fs.emptyDir(nodesDir);
      await fs.ensureDir(nodesDir);
      console.log("Folder nodes has been cleaned up");

      {
        const initFiles = `sh start.sh`;
        console.log(`Exec cmd: ${initFiles}`);
        const { stdout, stderr } = await execPromis(initFiles, { cwd: curDir });
        console.log(`init-files ${stdout}${stderr}\n`);
      }

      await fs.copy(polard, `./nodes/${polard}`);

      // update app.toml and config.toml
      for (let i = 0; i < nodesCount; i++) {
        let data;
        const appConfigPath = path.join(nodesDir, `node${i}/polard/config/app.toml`);
        data = await fs.readFile(appConfigPath, "utf8");
        data = updatePorts(data, app.port, i);
        data = updateCfg(data, app.cfg);
        await fs.writeFile(appConfigPath, data);

        const configPath = path.join(nodesDir, `node${i}/polard/config/config.toml`);
        data = await fs.readFile(configPath, "utf8");
        data = updatePorts(data, tendermint.port, i);

        const clientConfigPath = path.join(nodesDir, `node${i}/polard/config/client.toml`);
        data = clientCfg;
        data = data.replace("26657", tendermint.port["rpc.laddr"] + i + "");
        await fs.writeFile(clientConfigPath, data);


        const genesisPath = path.join(nodesDir, `node${i}/polard/config/genesis.json`);
        let genesis = await fs.readJSON(genesisPath);
        let alloc = genesis.app_state.evm.alloc;
        for (const preMineAccount of preMineAccounts) {
          alloc[preMineAccount] = {
            balance:preMinePerAccount
          }
        }
        await fs.outputJson(genesisPath, genesis, { spaces: 2 });
      }

      // 生成启动命令脚本
      let vbsStart = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
      let vbsStop = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
      for (let i = 0; i < nodesCount; i++) {
        let p2pPort = tendermint.port["p2p.laddr"] + i;
        let start = (platform == "win32" ? "" : "#!/bin/bash\n") + (isNohup && platform !== "win32" ? "nohup " : "") + (platform !== "win32" ? "./" : "") + `${polard} start --pruning=nothing --api.enabled-unsafe-cors --api.enable --api.swagger --home ./node${i}/polard/` + (isNohup && platform !== "win32" ? ` >./polar${i}.log 2>&1 &` : "");
        let stop =
          platform == "win32"
            ? `@echo off
for /f "tokens=5" %%i in ('netstat -ano ^| findstr 0.0.0.0:${p2pPort}') do set PID=%%i
taskkill /F /PID %PID%`
            : `pid=\`lsof -iTCP:${p2pPort} -sTCP:LISTEN -t\`;
if [[ -n $pid ]]; then kill -15 $pid; fi`;
        let startPath = path.join(nodesDir, `start${i}.` + (platform == "win32" ? "bat" : "sh"));
        let stopPath = path.join(nodesDir, `stop${i}.` + (platform == "win32" ? "bat" : "sh"));
        await fs.writeFile(startPath, start);
        await fs.writeFile(stopPath, stop);

        if (platform == "win32") {
          vbsStart += `ws.Run ".\\start${i}.bat",0\n`;
          vbsStop += `ws.Run ".\\stop${i}.bat",0\n`;
        } else {
          vbsStart += `./start${i}.sh\n`;
          vbsStop += `./stop${i}.sh\n`;
          await fs.chmod(startPath, 0o777);
          await fs.chmod(stopPath, 0o777);
        }
      }

      // 生成总的启动脚本
      let startAllPath = path.join(nodesDir, `startAll.` + (platform == "win32" ? "vbs" : "sh"));
      let stopAllPath = path.join(nodesDir, `stopAll.` + (platform == "win32" ? "vbs" : "sh"));
      await fs.writeFile(startAllPath, vbsStart);
      await fs.writeFile(stopAllPath, vbsStop);
      if (!(platform == "win32")) {
        await fs.chmod(startAllPath, 0o777);
        await fs.chmod(stopAllPath, 0o777);
      }
    } else {
      await fs.copy(polard, `./nodes/${polard}`, { overwrite: true });
    }

    if (isStart) {
      console.log("Start all polard node under the folder nodes");
      await execPromis(scriptStart, { cwd: nodesDir });
    }
  } catch (error) {
    console.log("error", error);
  }
};

init();
