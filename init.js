import { exec } from "child_process";
import fs from "fs-extra";
import path from "path";
import os from "os";
import util from "util";
import _yargs from "yargs";
import { hideBin } from "yargs/helpers";
import TenderKeys from "./tenderKeys.js";

const yargs = _yargs(hideBin(process.argv)); // https://github.com/yargs/yargs/issues/1854#issuecomment-787509517
let argv = yargs
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
  .option("t", {
    alias: "transaction",
    demandOption: false,
    default: false,
    describe: "Whether run transaction.js",
    type: "bool",
  })
  .number(["v"])
  .number(["cn"])
  .boolean(["n", "c", "s", "k", "t"]).argv;

const isNohup = argv.nohup;
const isStart = argv.start;
const isCompile = argv.compile;
const isKeep = argv.keep;
const isTx = argv.transaction;
const commonNode = argv.commonNode;
const validators = argv.validators;
const nodesCount = validators + commonNode;
const platform = argv.platform ? argv.platform : process.platform;
const arch = os.arch();
const execPromis = util.promisify(exec);
const curDir = process.cwd();
const nodesDir = path.join(curDir, "nodes");
const tendermintd = platform == "win32" ? "tendermint.exe" : "tendermint";

const scriptStop = path.join(nodesDir, platform == "win32" ? "stopAll.vbs" : "stopAll.sh");
const scriptStart = path.join(nodesDir, platform == "win32" ? "startAll.vbs" : "startAll.sh");
const tenderKeys = new TenderKeys();
const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

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
  console.log("argv:", JSON.stringify(argv), "platform:", platform, "arch:", arch);
  try {
    // 读取配置文件
    if (!fs.existsSync("./config.json")) {
      await fs.copyFile("./config.default.json", "./config.json");
    }

    let config = await fs.readJson("./config.json");
    let { tendermint, fixedFirstValidator, proxyApp } = config;
    proxyApp = proxyApp || "persistent_kvstore";

    const nodeKey = { priv_key: { type: "tendermint/PrivKeyEd25519", value: "rvevIbzKklrOu0Rr8vmXVZvSGbulZx9Do2eM1rvF/ZPOmJbA8MWQhFs6r8qO8NLVPhiPEl8OdGuWCcm4KysBdg==" } };
    const privValidatorKey = {
      address: "9A2884DEBB2983A2FC836D12E99AD72C9DE7AA4C",
      pub_key: {
        type: "tendermint/PubKeyEd25519",
        value: "jJA64Ys25oOW9+3/ES8Th6azlP8VMhpbKgjY9bDK6eg=",
      },
      priv_key: {
        type: "tendermint/PrivKeyEd25519",
        value: "OCS8XQT45Efqvg80BEtxW6SLd3C0u+DyCL5MuksWtCiMkDrhizbmg5b37f8RLxOHprOU/xUyGlsqCNj1sMrp6A==",
      },
    };

    if (await fs.pathExists(scriptStop)) {
      console.log("Try to stop the tendermint under the nodes directory");
      await execPromis(scriptStop, { cwd: nodesDir }); // Anyway, stop it first
      await sleep(platform == "win32" ? 600 : 300);
    }

    if (!fs.existsSync(tendermintd) || isCompile) {
      console.log("Start recompiling tendermint...");
      let make = await execPromis("go build ../cmd/tendermint", { cwd: curDir });
      console.log("tendermint compile finished", make);
    }

    if (!fs.existsSync(tendermintd)) {
      console.log("tendermint Executable file does not exist");
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
        let initFiles = `${platform !== "win32" ? "./" : ""}${tendermintd} testnet --v ${validators} --n ${commonNode} --o ./nodes`;
        // try {
        //   const testnetHelpCmd = `${platform !== "win32" ? "./" : ""}${tendermintd} testnet init-files --help`;
        //   const { stdout } = await execPromis(testnetHelpCmd, { cwd: curDir });
        //   if (stdout.includes("role-expiry-date") && fixedFirstValidator) {
        //   }
        // } catch (error) {
        //   console.log("err", error);
        // }

        console.log(`Exec cmd: ${initFiles}`);
        const { stdout, stderr } = await execPromis(initFiles, { cwd: curDir });
        console.log(`testnet ${stdout}${stderr}\n`);

        if (fixedFirstValidator) {
          await fs.writeJSON(path.join(nodesDir, `node0/config/node_key.json`), nodeKey);
          await fs.writeJSON(path.join(nodesDir, `node0/config/priv_validator_key.json`), privValidatorKey);
        }
      }

      await fs.copy(tendermintd, `./nodes/${tendermintd}`);

      let nodeIds = [];
      for (let i = 0; i < nodesCount; i++) {
        const nodeKey = await fs.readJSON(path.join(nodesDir, `node${i}/config/node_key.json`));
        const nodeId = tenderKeys.getBurrowAddressFromPrivKey(Buffer.from(nodeKey.priv_key.value, "base64").toString("hex"));
        nodeIds.push(nodeId);
      }

      for (let i = 0; i < nodesCount; i++) {
        const genesisPath = path.join(nodesDir, `node${i}/config/genesis.json`);
        let genesis = await fs.readJSON(genesisPath);
        if (fixedFirstValidator) {
          genesis.validators[0] = {
            address: "9A2884DEBB2983A2FC836D12E99AD72C9DE7AA4C",
            pub_key: {
              type: "tendermint/PubKeyEd25519",
              value: "jJA64Ys25oOW9+3/ES8Th6azlP8VMhpbKgjY9bDK6eg=",
            },
            power: "1",
            name: "node0",
          };
        }

        const genesisCfg = config.genesisCfg;
        if (Array.isArray(genesisCfg)) {
          for (const cfg of genesisCfg) {
            eval("genesis." + cfg);
          }
        }

        await fs.outputJson(genesisPath, genesis, { spaces: 2 });
      }

      // update config.toml
      for (let i = 0; i < nodesCount; i++) {
        let data;

        const configPath = path.join(nodesDir, `node${i}/config/config.toml`);
        data = await fs.readFile(configPath, "utf8");
        data = updatePorts(data, tendermint.port, i);
        // replace persistent_peers
        let peers = [];
        const p2pPort = tendermint.port["p2p.laddr"];
        for (let j = 0; j < nodesCount && nodesCount > 1; j++) {
          if (i != j) {
            peers.push(`${nodeIds[j]}@127.0.0.1:${p2pPort + j}`);
          }
        }
        tendermint.cfg["p2p.persistent_peers"] = `"${peers.join()}"`;
        data = updateCfg(data, tendermint.cfg);
        await fs.writeFile(configPath, data);
      }

      // 生成启动命令脚本
      let vbsStart = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
      let vbsStop = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
      for (let i = 0; i < nodesCount; i++) {
        let p2pPort = tendermint.port["p2p.laddr"] + i;
        let start = (platform == "win32" ? "" : "#!/bin/bash\n") + (isNohup && platform !== "win32" ? "nohup " : "") + (platform !== "win32" ? "./" : "") + `${tendermintd} start --proxy_app ${proxyApp} --home ./node${i}` + (isNohup && platform !== "win32" ? ` >./tendermint${i}.log 2>&1 &` : "");
        let stop =
          platform == "win32"
            ? `@echo off
for /f "tokens=5" %%i in ('netstat -ano ^| findstr 0.0.0.0:${p2pPort}') do set PID=%%i
taskkill /F /PID %PID%`
            : platform == "linux"
            ? `pid=\`netstat -anp | grep :::${p2pPort} | awk '{printf $7}' | cut -d/ -f1\`;
    kill -15 $pid`
            : `pid=\`lsof -i :${p2pPort} | grep tendermi | grep LISTEN | awk '{printf $2}'|cut -d/ -f1\`;
    if [ "$pid" != "" ]; then kill -15 $pid; fi`;
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
      await fs.copy(tendermint, `./nodes/${tendermint}`, { overwrite: true });
    }

    if (isStart) {
      console.log("Start all tendermint node under the folder nodes");
      await execPromis(scriptStart, { cwd: nodesDir }); // 不管怎样先执行一下停止

      if (isTx) {
        console.log("\nStart call tx.js main function");
        if (!fs.existsSync("./tx.js")) {
          await fs.copyFile("./tx.default.js", "./tx.js");
        }
        const tx = await import("./tx.js");
        await tx.main();
      }
    }
  } catch (error) {
    console.log("error", error);
  }
};

init();
