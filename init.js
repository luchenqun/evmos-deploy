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
const evmosd = platform == "win32" ? "qstarsd.exe" : "qstarsd";
let chainId = "evmos_9000-1";
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

    const nodeKey = { priv_key: { type: "tendermint/PrivKeyEd25519", value: "zLwmvMEw3OGwtdgaismSKF+ujNfHfO6z382MjtK4RljqK3k31x5dr+nopsN78fSNyc2nfnuWJTgJMGjr2GKhhw==" } };
    const privValidatorKey = { address: "020A0F48A2F4CE0F0CA6DEBF71DB83474DD717D0", pub_key: { type: "tendermint/PubKeyEd25519", value: "nfJ0axJC9dhta1MAE1EBFaVdxxkYzxYrBaHuJVjG//M=" }, priv_key: { type: "tendermint/PrivKeyEd25519", value: "YSBETu11SkiMJgh5z5QMrLG1vMBk/0U5hYR3FDZtvAKd8nRrEkL12G1rUwATUQEVpV3HGRjPFisFoe4lWMb/8w==" } };
    const createValidator = {
      body: {
        messages: [
          {
            "@type": "/cosmos.staking.v1beta1.MsgCreateValidator",
            description: { moniker: "node0", identity: "", website: "", security_contact: "", details: "" },
            commission: { rate: "0.100000000000000000", max_rate: "1.000000000000000000", max_change_rate: "1.000000000000000000" },
            min_self_delegation: "1",
            delegator_address: "evmos1hajh6rhhkjqkwet6wqld3lgx8ur4y3khjuxkxh",
            validator_address: "evmosvaloper1hajh6rhhkjqkwet6wqld3lgx8ur4y3khljfx82",
            pubkey: { "@type": "/cosmos.crypto.ed25519.PubKey", key: "nfJ0axJC9dhta1MAE1EBFaVdxxkYzxYrBaHuJVjG//M=" },
            value: { denom: "aevmos", amount: "100000000000000000000" },
          },
        ],
        memo: "855fc1f66a514c7ac32d2c081cca0af4b81dfb8c@192.168.0.1:26656",
        timeout_height: "0",
        extension_options: [],
        non_critical_extension_options: [],
      },
      auth_info: { signer_infos: [{ public_key: { "@type": "/ethermint.crypto.v1.ethsecp256k1.PubKey", key: "A50rbJg3TMPACbzE5Ujg0clx+d4udBAtggqEQiB7v9Sc" }, mode_info: { single: { mode: "SIGN_MODE_DIRECT" } }, sequence: "0" }], fee: { amount: [], gas_limit: "0", payer: "", granter: "" }, tip: null },
      signatures: ["wv9gukw9krBF9r6uEFAK5iHVFXynF1FKnbIfgfOXCdpMi4v++dQ3zoCnDjsHvuTRqCZWJuyREbaijV9oN70CVwE="],
    };
    const keySeed = {
      secret: "october pride genuine harvest reunion sight become tuna kingdom punch girl lizard cat crater fee emotion seat test output safe volume caught design soft",
      privateKey: "e54bff83fc945cba77ca3e45d69adc5b57ad8db6073736c8422692abecfb5fe2",
      publicKey: "039d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c",
      address: "0xbf657D0ef7b48167657A703Ed8Fd063F075246D7",
      bip39Address: "evmos1hajh6rhhkjqkwet6wqld3lgx8ur4y3khjuxkxh",
    };
    if (await fs.pathExists(scriptStop)) {
      console.log("Try to stop the evmosd under the nodes directory");
      await execPromis(scriptStop, { cwd: nodesDir }); // Anyway, stop it first
      await sleep(platform == "win32" ? 600 : 300);
    }

    if (!fs.existsSync(evmosd) || isCompile) {
      console.log("Start recompiling evmosd...");
      let make = await execPromis(`go build -o ${evmosd} ../cmd/evmosd`, { cwd: curDir });
      console.log("evmosd compile finished", make);
    }

    if (!fs.existsSync(evmosd)) {
      console.log("evmosd Executable file does not exist");
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
        const initFiles = `${platform !== "win32" ? "./" : ""}${evmosd} testnet init-files --v ${nodesCount} --output-dir ./nodes --chain-id ${chainId} --keyring-backend test`;
        const initFilesValidator = `${platform !== "win32" ? "./" : ""}${evmosd} testnet init-files --v ${validators} --output-dir ./nodes --chain-id ${chainId} --keyring-backend test`;
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
          const genesisPath = path.join(nodesDir, `node0/evmosd/config/genesis.json`);
          for (let i = validators; i < nodesCount; i++) {
            await fs.copy(genesisPath, path.join(nodesDir, `node${i}/evmosd/config/genesis.json`));
          }
        }

        if (fixedFirstValidator) {
          await fs.writeJSON(path.join(nodesDir, `node0/evmosd/config/node_key.json`), nodeKey);
          await fs.writeJSON(path.join(nodesDir, `node0/evmosd/config/priv_validator_key.json`), privValidatorKey);
          await fs.outputJSON(path.join(nodesDir, `node0/evmosd/key_seed.json`), keySeed);
          const keyringPath = path.join(nodesDir, `node0/evmosd/keyring-test`);
          await fs.emptyDir(keyringPath);
          await fs.writeFile(
            path.join(keyringPath, `bf657d0ef7b48167657a703ed8fd063f075246d7.address`),
            "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMi0wOC0yNCAxODowOTowNC43NjQ4NTEgKzA4MDAgQ1NUIG09KzAuMjI4NTE5MjUxIiwiZW5jIjoiQTI1NkdDTSIsInAyYyI6ODE5MiwicDJzIjoiVHM3QXhNRmV4MlZtMTZpeiJ9.OrWluGLeod9SjmLDqvXTcA63z9P1VZ-D0l5LFzwVOhJG67vl3b0HXQ.BrINO_FqPHviDFff.yk2tJKWkWIo-OXZfxr7INBATtLws_mHvT5s4kSfwDkbpp2JJVyoEwFcozQHp5hh9owc3bPG7HRa_QHQarB5_Oz-fXJkuPlTxR955P6azI1C8vuWqBcZ7nfZkAhoFHgSZzQAPuFp6sPTWoDampAqocmtWu2lYPSiRnDHRZ6gEmP1slwsRwJTlASEwpmzjBeDsqrwCn9cT_jNrI7ilWB4LBUUXAkkKVu-p1X9bkqo8yZ_UrFFR2rI.6rVArcxnth5pzzgbEtuHSQ"
          );
          await fs.writeFile(
            path.join(keyringPath, `node0.info`),
            "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMi0wOC0yNCAxODowOTowNC43NTg1NjYgKzA4MDAgQ1NUIG09KzAuMjIyMjM0MDQzIiwiZW5jIjoiQTI1NkdDTSIsInAyYyI6ODE5MiwicDJzIjoicmk3MzV2Y3Fid2VkUF9JcCJ9.ht-BieDMdmkOBfb1saBx2nvBDaD9anNxP5RTirHIk-tHUXJr6HbeKA.FvpzGpaY6il86ngO.WwHd6HTneYvxg3KkEhsXx1_F_XkmzHqVJwSmQrnX9ZSg2L8ZCAxV6rvliuRwt30816o8tElb06qpp1krFGwGL_LvP1FtnOiX4GdJJxAyX1lgBgJQrhZuqKc6EEE78ArwUR1Mb6b3ax_6oV7IB42izg1ci2PP5bgXN-510EM9RrSi9fnVl3UMoAanoBL8NfJGYHo2Cusn_Y14yEnPDHxS96vTl7wZx_pZrjtapyQ9ktnDQHVBfsupIKmIYXSwpQ16FQ9G4eclfKGhit4uUFofdT0UMG1g_aQEGHt1nPG08w66w8PxmW8ma_D8yCQp0TW6m9pTLWODiCztorLucEr9RFW9mJLofi4pFdCuqHrGm_o.X06PXwtrfTMDgiQDIpPS0g"
          );
        }
      }

      await fs.copy(evmosd, `./nodes/${evmosd}`);

      let nodeIds = [];
      for (let i = 0; i < nodesCount; i++) {
        const nodeKey = await fs.readJSON(path.join(nodesDir, `node${i}/evmosd/config/node_key.json`));
        const nodeId = privKeyToBurrowAddres(nodeKey.priv_key.value);
        nodeIds.push(nodeId);

        const keySeedPath = path.join(nodesDir, `node${i}/evmosd/key_seed.json`);
        let curKeySeed = await fs.readJSON(keySeedPath);
        const wallet = HDNodeWallet.fromPhrase(curKeySeed.secret);
        curKeySeed.privateKey = wallet.privateKey.replace("0x", "");
        curKeySeed.publicKey = wallet.publicKey.replace("0x", "");
        curKeySeed.address = wallet.address;
        curKeySeed.bip39Address = ethToEvmos(wallet.address);
        await fs.outputJson(keySeedPath, curKeySeed, { spaces: 2 });
      }

      const account = { "@type": "/ethermint.types.v1.EthAccount", base_account: { address: "", pub_key: null, account_number: "0", sequence: "0" }, code_hash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470" };
      const balance = { address: "", coins: [{ denom: "aqai", amount: "0" }] };
      for (let i = 0; i < nodesCount; i++) {
        let accounts = [];
        let balances = [];
        if (Array.isArray(preMineAccounts)) {
          for (const address of preMineAccounts) {
            accounts.push(Object.assign(JSON.parse(JSON.stringify(account)), { base_account: { address } }));
            balances.push(Object.assign(JSON.parse(JSON.stringify(balance)), { address }));
          }
        }

        const genesisPath = path.join(nodesDir, `node${i}/evmosd/config/genesis.json`);
        let genesis = await fs.readJSON(genesisPath);
        let appState = genesis.app_state;
        appState.auth.accounts.push(...accounts);
        appState.bank.balances.push(...balances);
        if (commonNode > 0) {
          for (let i = nodesCount - commonNode; i < nodesCount; i++) {
            const keySeedPath = path.join(nodesDir, `node${i}/evmosd/key_seed.json`);
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
        }

        const genesisCfg = config.genesisCfg;
        if (Array.isArray(genesisCfg)) {
          for (const cfg of genesisCfg) {
            eval("genesis." + cfg);
          }
        }

        // Use zero address to occupy the first account, Because of account_ Accounts with number 0 cannot send Cosmos transactions
        appState.auth.accounts.unshift(Object.assign(JSON.parse(JSON.stringify(account)), { base_account: { address: "qai1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzlt2kq" } }));

        await fs.outputJson(genesisPath, genesis, { spaces: 2 });
      }

      // update app.toml and config.toml
      for (let i = 0; i < nodesCount; i++) {
        let data;
        const appConfigPath = path.join(nodesDir, `node${i}/evmosd/config/app.toml`);
        data = await fs.readFile(appConfigPath, "utf8");
        data = updatePorts(data, app.port, i);
        data = updateCfg(data, app.cfg);
        await fs.writeFile(appConfigPath, data);

        const configPath = path.join(nodesDir, `node${i}/evmosd/config/config.toml`);
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

        const clientConfigPath = path.join(nodesDir, `node${i}/evmosd/config/client.toml`);
        data = clientCfg;
        data = data.replace("26657", tendermint.port["rpc.laddr"] + i + "");
        await fs.writeFile(clientConfigPath, data);
      }

      if (Array.isArray(privateKeys)) {
        for (const privateKey of privateKeys) {
          const cmd = `echo -n "your-password" | ./evmosd keys unsafe-import-eth-key ${privateKey.name} ${privateKey.key} --home ./nodes/node0/evmosd --keyring-backend test`;
          await execPromis(cmd, { cwd: curDir });
        }
      }

      // 生成启动命令脚本
      let vbsStart = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
      let vbsStop = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
      for (let i = 0; i < nodesCount; i++) {
        let p2pPort = tendermint.port["p2p.laddr"] + i;
        let start = (platform == "win32" ? "" : "#!/bin/bash\n") + (isNohup && platform !== "win32" ? "nohup " : "") + (platform !== "win32" ? "./" : "") + `${evmosd} start --keyring-backend test --home ./node${i}/evmosd/` + (isNohup && platform !== "win32" ? ` >./qstars${i}.log 2>&1 &` : "");
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
      await fs.copy(evmosd, `./nodes/${evmosd}`, { overwrite: true });
    }

    if (isStart) {
      console.log("Start all evmosd node under the folder nodes");
      await execPromis(scriptStart, { cwd: nodesDir });
    }
  } catch (error) {
    console.log("error", error);
  }
};

init();
