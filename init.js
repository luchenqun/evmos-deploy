import { HDNodeWallet } from "ethers";
import { exec } from "child_process";
import fs from "fs-extra";
import path from "path";
import os from "os";
import util from "util";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ethToBech32, privKeyToBurrowAddres, sleep } from "./utils.js";

// https://github.com/yargs/yargs/issues/1854#issuecomment-787509517
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
  .option("br", {
    alias: "before-run",
    demandOption: false,
    default: false,
    describe: "before run node, execute beforeRun.js",
    type: "bool",
  })
  .option("ar", {
    alias: "after-run",
    demandOption: false,
    default: false,
    describe: "before run node, execute afterRun.js",
    type: "bool",
  })
  .number(["v"])
  .number(["cn"])
  .boolean(["n", "c", "s", "br", "ar", "k", "t"]).argv;

const isNohup = argv.nohup;
const isStart = argv.start;
const isBeforeRun = argv.br;
const isAfterRun = argv.ar;
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
const quarixd = platform == "win32" ? "quarixd.exe" : "quarixd";
let chainId = "quarix_8888888-1";
let clientCfg = `
# The network chain ID
chain-id = "${chainId}"
# The keyring's backend, where the keys are stored (os|file|kwallet|pass|test|memory)
keyring-backend = "test"
# CLI output format (text|json)
output = "text"
# <host>:<port> to Tendermint RPC interface for this chain
node = "tcp://localhost:26657"
# Transaction broadcasting mode (sync|async|block)
broadcast-mode = "block"
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
  console.log("argv:", JSON.stringify(argv), "platform:", platform, "arch:", arch);
  try {
    // 读取配置文件
    if (!fs.existsSync("./config.json")) {
      await fs.copyFile("./config.default.json", "./config.json");
    }

    let config = await fs.readJson("./config.json");
    const { app, tendermint, preMinePerAccount, fixedFirstValidator, preMineAccounts, privateKeys } = config;
    if (app.chain_id) {
      clientCfg = clientCfg.replaceAll(chainId, app.chain_id);
      chainId = app.chain_id;
    }

    const nodeKey = {
      priv_key: {
        type: "tendermint/PrivKeyEd25519",
        value: "jawXThUVHDQQflxSXHYMDDtSx5vc9XsD0Eb4zoygQvjCk1UX3ePJ3xPuTUlsJBUjEJV8hB4wfflrZ8sl+kZasQ==",
      },
    };
    const privValidatorKey = {
      address: "62382679430420F0987AD892B1D52B80F6E306DB",
      pub_key: { type: "tendermint/PubKeyEd25519", value: "/PnMg/MEeXAUsmAsV2QpV2PDH/PAn3fSskPza5mXR/4=" },
      priv_key: {
        type: "tendermint/PrivKeyEd25519",
        value: "MRm4JzYL7BGrsRzD7deY3wT09Hjs0m2VJKSUG0i3Vrz8+cyD8wR5cBSyYCxXZClXY8Mf88Cfd9KyQ/NrmZdH/g==",
      },
    };
    const createValidator = {
      body: {
        messages: [
          {
            "@type": "/cosmos.staking.v1beta1.MsgCreateValidator",
            description: {
              moniker: "node0",
              identity: "",
              website: "",
              security_contact: "",
              details: "",
            },
            commission: {
              rate: "0.100000000000000000",
              max_rate: "1.000000000000000000",
              max_change_rate: "1.000000000000000000",
            },
            min_self_delegation: "1",
            delegator_address: "quarix1hajh6rhhkjqkwet6wqld3lgx8ur4y3khmpfhlu",
            validator_address: "quarixvaloper1hajh6rhhkjqkwet6wqld3lgx8ur4y3khajuzj7",
            pubkey: {
              "@type": "/cosmos.crypto.ed25519.PubKey",
              key: "/PnMg/MEeXAUsmAsV2QpV2PDH/PAn3fSskPza5mXR/4=",
            },
            value: { denom: "aqrx", amount: "100000000000000000000" },
          },
        ],
        memo: "d53fe9351b94fd03be1fa219f39e3b77e4b23e2b@192.168.0.1:26656",
        timeout_height: "0",
        extension_options: [],
        non_critical_extension_options: [],
      },
      auth_info: {
        signer_infos: [
          {
            public_key: {
              "@type": "/ethermint.crypto.v1.ethsecp256k1.PubKey",
              key: "A50rbJg3TMPACbzE5Ujg0clx+d4udBAtggqEQiB7v9Sc",
            },
            mode_info: { single: { mode: "SIGN_MODE_DIRECT" } },
            sequence: "0",
          },
        ],
        fee: { amount: [], gas_limit: "0", payer: "", granter: "" },
        tip: null,
      },
      signatures: ["RjghsgehZak8VRmereMlEtymEc1usLsBH9hlxhqYjxsu/AKy+v520TSOuq/sXizSPYJqW/GDFaeYl3dtXGcE+wE="],
    };
    const keySeed = {
      secret: "october pride genuine harvest reunion sight become tuna kingdom punch girl lizard cat crater fee emotion seat test output safe volume caught design soft",
      privateKey: "e54bff83fc945cba77ca3e45d69adc5b57ad8db6073736c8422692abecfb5fe2",
      publicKey: "049d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c1adb92ef31b067e67e77dc77061f76bb52fe4dfa85667f27657610a77429a09b",
      compressedPublicKey: "039d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c",
      address: "0xbf657D0ef7b48167657A703Ed8Fd063F075246D7",
      bip39Address: "quarix1hajh6rhhkjqkwet6wqld3lgx8ur4y3khmpfhlu",
    };
    if (await fs.pathExists(scriptStop)) {
      console.log("Try to stop the quarixd under the nodes directory");
      await execPromis(scriptStop, { cwd: nodesDir }); // Anyway, stop it first
      await sleep(platform == "win32" ? 600 : 300);
    }
    if (!fs.existsSync(quarixd) || isCompile) {
      console.log("Start recompiling quarixd...");
      let make = await execPromis("go build ../cmd/quarixd", { cwd: curDir });
      console.log("quarixd compile finished", make);
    }

    if (!fs.existsSync(quarixd)) {
      console.log("quarixd Executable file does not exist");
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
        let initFiles = `${platform !== "win32" ? "./" : ""}${quarixd} testnet init-files --v ${nodesCount} --output-dir ./nodes --chain-id ${chainId} --keyring-backend test`;
        let initFilesValidator = `${platform !== "win32" ? "./" : ""}${quarixd} testnet init-files --v ${validators} --output-dir ./nodes --chain-id ${chainId} --keyring-backend test`;
        try {
          const testnetHelpCmd = `${platform !== "win32" ? "./" : ""}${quarixd} testnet init-files --help`;
          const { stdout } = await execPromis(testnetHelpCmd, { cwd: curDir });
          if (stdout.includes("role-expiry-date") && fixedFirstValidator) {
            initFiles += " --role-validators 0xbf657D0ef7b48167657A703Ed8Fd063F075246D7";
            initFilesValidator += " --role-validators 0xbf657D0ef7b48167657A703Ed8Fd063F075246D7";
          }
        } catch (error) {
          console.log("err", error);
        }

        console.log(`Exec cmd: ${initFiles}`);
        const { stdout, stderr } = await execPromis(initFiles, { cwd: curDir });
        console.log(`init-files ${stdout}${stderr}\n`);

        if (commonNode > 0) {
          for (let i = 0; i < validators; i++) {
            await fs.remove(path.join(nodesDir, `node${i}`));
          }
          await fs.remove(path.join(nodesDir, `gentxs`));

          // re init validator, and turn a validator node into a common node
          await execPromis(initFilesValidator, { cwd: curDir });
          const genesisPath = path.join(nodesDir, `node0/quarixd/config/genesis.json`);
          for (let i = validators; i < nodesCount; i++) {
            await fs.copy(genesisPath, path.join(nodesDir, `node${i}/quarixd/config/genesis.json`));
          }
        }

        if (fixedFirstValidator) {
          await fs.writeJSON(path.join(nodesDir, `node0/quarixd/config/node_key.json`), nodeKey);
          await fs.writeJSON(path.join(nodesDir, `node0/quarixd/config/priv_validator_key.json`), privValidatorKey);
          await fs.outputJSON(path.join(nodesDir, `node0/quarixd/key_seed.json`), keySeed);
          const keyringPath = path.join(nodesDir, `node0/quarixd/keyring-test`);
          await fs.emptyDir(keyringPath);
          await fs.writeFile(
            path.join(keyringPath, `bf657d0ef7b48167657a703ed8fd063f075246d7.address`),
            "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMy0wMy0xNyAxNToxNzoyMi4yMTA4NjkgKzA4MDAgQ1NUIG09KzAuMDkwODExMTI2IiwiZW5jIjoiQTI1NkdDTSIsInAyYyI6ODE5MiwicDJzIjoiaE1GUk1GS3VmWG1MN3JqTCJ9.7BAWENEQQIuPQgTpU4KndAzJehSmrfpmCB3QjetS-aDxkCQi4eKS9g.0Yqfk_vOloLdfMu4.BLT_MDoICsIXwiFVQkHfSwva025Ys6T1vEIgucHj31E8_2LImXjE9E7SF2MayogN9nTr_TRw_rlPy6AJ79Bi3hscunNZHNA46WxsncNJodp5iBMTRt2KG2JeMiCEHRUIh1OATVqc_nKqnkR0ZgPHFKxCQY5xUoPB_Ix_fqARrFcSQEk_sLceRpRMRVWj3yOpg6YzFi47x7IGoIg1OsvhsKj1sOYqCTgTzcRDSzEG3ROZgzbpBuM.u-hKqVwDVyujqCQCMaQzzw"
          );
          await fs.writeFile(
            path.join(keyringPath, `node0.info`),
            "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMy0wMy0xNyAxNToxNzoyMi4yMDkzODEgKzA4MDAgQ1NUIG09KzAuMDg5MzIzNDE4IiwiZW5jIjoiQTI1NkdDTSIsInAyYyI6ODE5MiwicDJzIjoiUDBPUkJVczJ1eWRYR3RUZyJ9.XaNXPomwcd9zfFaazm6QP3XeFQPY4Qm4zFh12YO3GDyOykBdB_RxiA.VR3S0G6Cm081EtOJ.oq8vBlNiOIJRSfkL3FKTHRClIW5IzVh4yQy-Drh2NnyCRbIKu41arpFq9UggKfm3i2kukscRqX2UN4Fi5KHlc3sS4Vq4d2aMlP_2vp7S3xVeLMEaVqZN-WuMG_FHOJiWxAFgzJn5uV5G-6WxOAK3CsxPzbc0k7VlkV705tSsCmPbWf4jNeuRQjdK6fjppx3jcipmX4M6I5xTO1Rv9imRuMP3prCF_XYgEd86OG3l_HrCTjI-TCaCmhtONaCpenmBzbB-4hDokDSslvxyDbYnoTPnWxDmVLRmm5vH1POVSna7kUXX3UB8uQyDQ_BA2oc6X27r7Ov5S1Jw3cRj-rL9MbpUVe7QftG_FV0CiRsAbEjc1z3iVrbP_uWHk2wGJzKF02GNlsFiLvIDjDAGDN6R1Ku2pNdsoyHllkUZ2P_3masJUR4KXNmPW5w7EePkvl-VegMRzBjS65Qtc-veGtp1VmFIi2o.1FZA0sSwiFUphL4cuXJHog"
          );
        }
      }

      await fs.copy(quarixd, `./nodes/${quarixd}`);

      let nodeIds = [];
      for (let i = 0; i < nodesCount; i++) {
        const nodeKey = await fs.readJSON(path.join(nodesDir, `node${i}/quarixd/config/node_key.json`));
        const nodeId = privKeyToBurrowAddres(nodeKey.priv_key.value).toString("hex");
        nodeIds.push(nodeId);

        const keySeedPath = path.join(nodesDir, `node${i}/quarixd/key_seed.json`);
        let curKeySeed = await fs.readJSON(keySeedPath);
        const wallet = HDNodeWallet.fromPhrase(curKeySeed.secret);
        curKeySeed.privateKey = wallet.privateKey.replace("0x", "");
        curKeySeed.publicKey = wallet.publicKey.replace("0x", "");
        curKeySeed.address = wallet.address;
        curKeySeed.bip39Address = ethToBech32(wallet.address, "quarix");
        curKeySeed.valAddress = ethToBech32(wallet.address, "quarixvaloper");
        await fs.outputJson(keySeedPath, curKeySeed, { spaces: 2 });
      }

      const account = {
        "@type": "/ethermint.types.v1.EthAccount",
        base_account: { address: "" },
        code_hash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      };
      const balance = {
        address: "",
        coins: [
          { denom: "aqare", amount: "0" },
          { denom: "aqrx", amount: "0" },
        ],
      };

      for (let i = 0; i < nodesCount; i++) {
        let accounts = [];
        let balances = [];
        if (Array.isArray(preMineAccounts)) {
          for (const address of preMineAccounts) {
            accounts.push(Object.assign(JSON.parse(JSON.stringify(account)), { base_account: { address } }));
            balances.push(Object.assign(JSON.parse(JSON.stringify(balance)), { address }));
          }
        }

        const genesisPath = path.join(nodesDir, `node${i}/quarixd/config/genesis.json`);
        let genesis = await fs.readJSON(genesisPath);
        let appState = genesis.app_state;
        appState.auth.accounts.push(...accounts);
        appState.bank.balances.push(...balances);
        if (commonNode > 0) {
          for (let i = nodesCount - commonNode; i < nodesCount; i++) {
            const keySeedPath = path.join(nodesDir, `node${i}/quarixd/key_seed.json`);
            const curKeySeed = await fs.readJSON(keySeedPath);
            const address = curKeySeed.bip39Address;
            appState.auth.accounts.push(Object.assign(JSON.parse(JSON.stringify(account)), { base_account: { address } }));
            appState.bank.balances.push(Object.assign(JSON.parse(JSON.stringify(balance)), { address }));
          }
        }

        for (let balances of appState.bank.balances) {
          for (let coin of balances.coins) {
            coin.amount = preMinePerAccount;
          }
        }

        if (fixedFirstValidator) {
          appState.auth.accounts[0].base_account.address = keySeed.bip39Address;
          appState.bank.balances[0].address = keySeed.bip39Address;
          appState.genutil.gen_txs[0] = createValidator;
          appState.staking.allocate_investment_program_pools.push({
            ipp_id: "1",
            validator_address: "quarixvaloper1hajh6rhhkjqkwet6wqld3lgx8ur4y3khajuzj7",
          });
          if (appState?.evm?.role) {
            appState.evm.role.roles[0] = {
              to: "0xbf657D0ef7b48167657A703Ed8Fd063F075246D7",
              type: "Validator",
            };
            appState.evm.sbt.kyc_list.push({
              to: "0xbf657D0ef7b48167657A703Ed8Fd063F075246D7",
              expiry_date: "1849306088",
            });
          }
        }
        // Use zero address to occupy the first account, Because of account_ Accounts with number 0 cannot send Cosmos transactions
        appState.auth.accounts.unshift(Object.assign(JSON.parse(JSON.stringify(account)), { base_account: { address: "quarix1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqcl7sy7" } }));

        const genesisCfg = config.genesisCfg;
        if (Array.isArray(genesisCfg)) {
          for (const cfg of genesisCfg) {
            eval("genesis." + cfg);
          }
        }

        await fs.outputJson(genesisPath, genesis, { spaces: 2 });
      }

      // update app.toml and config.toml and client.toml
      for (let i = 0; i < nodesCount; i++) {
        let data;
        const appConfigPath = path.join(nodesDir, `node${i}/quarixd/config/app.toml`);
        data = await fs.readFile(appConfigPath, "utf8");
        data = updatePorts(data, app.port, i);
        data = updateCfg(data, app.cfg);
        await fs.writeFile(appConfigPath, data);

        const configPath = path.join(nodesDir, `node${i}/quarixd/config/config.toml`);
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

        const clientConfigPath = path.join(nodesDir, `node${i}/quarixd/config/client.toml`);
        data = clientCfg;
        data = data.replace("26657", tendermint.port["rpc.laddr"] + i + "");
        await fs.writeFile(clientConfigPath, data);
      }

      if (Array.isArray(privateKeys)) {
        for (const privateKey of privateKeys) {
          const cmd = `echo -n "your-password" | ./quarixd keys unsafe-import-eth-key ${privateKey.name} ${privateKey.key} --home ./nodes/node0/quarixd --keyring-backend test`;
          await execPromis(cmd, { cwd: curDir });
        }
      }

      // 生成启动命令脚本
      let vbsStart = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
      let vbsStop = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
      for (let i = 0; i < nodesCount; i++) {
        let p2pPort = tendermint.port["p2p.laddr"] + i;
        let start = (platform == "win32" ? "" : "#!/bin/bash\n") + (isNohup && platform !== "win32" ? "nohup " : "") + (platform !== "win32" ? "./" : "") + `${quarixd} start --keyring-backend test --home ./node${i}/quarixd/` + (isNohup && platform !== "win32" ? ` >./quarix${i}.log 2>&1 &` : "");
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
      await fs.copy(quarixd, `./nodes/${quarixd}`, { overwrite: true });
    }

    if (isBeforeRun) {
      console.log("\nStart call beforeRun.js main function");
      if (!fs.existsSync("./beforeRun.js")) {
        await fs.copyFile("./beforeRun.default.js", "./beforeRun.js");
      }
      const run = await import("./beforeRun.js");
      await run.main();
    }

    if (isStart) {
      console.log("Start all quarixd node under the folder nodes");
      await execPromis(scriptStart, { cwd: nodesDir }); // 不管怎样先执行一下停止
    }

    if (isAfterRun) {
      console.log("\nStart call afterRun.js main function");
      if (!fs.existsSync("./afterRun.js")) {
        await fs.copyFile("./afterRun.default.js", "./afterRun.js");
      }
      const run = await import("./afterRun.js");
      await run.main();
    }
  } catch (error) {
    console.log("error", error);
  }
};

init();
