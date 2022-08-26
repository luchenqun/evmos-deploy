import util from "util";
import { exec } from "child_process";
import fs from "fs-extra";
import path from "path";
import { Wallet } from "@ethersproject/wallet";
import TenderKeys from "./tenderKeys.js";
import _yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ethToEvmos } from "@tharsis/address-converter";

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
  .number(["v"])
  .number(["cn"])
  .boolean(["n", "c", "s"]).argv;

const isNohup = argv.nohup;
const isStart = argv.start;
const isCompile = argv.compile;
const commonNode = argv.commonNode;
const validators = argv.validators;
const nodesCount = validators + commonNode;
const platform = argv.platform ? argv.platform : process.platform;
const execPromis = util.promisify(exec);
const curDir = process.cwd();
const nodesDir = path.join(curDir, "nodes");
const evmosd = platform == "win32" ? "evmosd.exe" : "evmosd";
const scriptStop = path.join(nodesDir, platform == "win32" ? "stopAll.vbs" : "stopAll.sh");
const scriptStart = path.join(nodesDir, platform == "win32" ? "startAll.vbs" : "startAll.sh");
const tenderKeys = new TenderKeys();
const nodeKey = { priv_key: { type: "tendermint/PrivKeyEd25519", value: "bq6XFN3gT1s5TR4uvEZo71VK2XrKdaQ1ecXKXOPEr8q0wRHFwEwP97pmwewLjtHDTYok5rS4T9751MaSIlS6Vg==" } };
const privValidatorKey = { address: "A8BF37F9C6EAE0E808319460EDD5A3D714613D7A", pub_key: { type: "tendermint/PubKeyEd25519", value: "caL9Bf7Mnrony4HOYgKo5JSCYLyNyTUyt+pw+vbmjdw=" }, priv_key: { type: "tendermint/PrivKeyEd25519", value: "jH2WRl02s7AIhqCJqYmnBl+atc7aXZnhb5DQCk3FbR1xov0F/syeuifLgc5iAqjklIJgvI3JNTK36nD69uaN3A==" } };
const createValidator = { body: { messages: [{ "@type": "/cosmos.staking.v1beta1.MsgCreateValidator", description: { moniker: "node0", identity: "", website: "", security_contact: "", details: "" }, commission: { rate: "1.000000000000000000", max_rate: "1.000000000000000000", max_change_rate: "1.000000000000000000" }, min_self_delegation: "1", delegator_address: "evmos1hajh6rhhkjqkwet6wqld3lgx8ur4y3khjuxkxh", validator_address: "evmosvaloper1hajh6rhhkjqkwet6wqld3lgx8ur4y3khljfx82", pubkey: { "@type": "/cosmos.crypto.ed25519.PubKey", key: "caL9Bf7Mnrony4HOYgKo5JSCYLyNyTUyt+pw+vbmjdw=" }, value: { denom: "agov", amount: "100000000000000000000" } }], memo: "90d5c044ed4938cfeac4f41635db3b88c894c21f@192.168.0.1:26656", timeout_height: "0", extension_options: [], non_critical_extension_options: [] }, auth_info: { signer_infos: [{ public_key: { "@type": "/ethermint.crypto.v1.ethsecp256k1.PubKey", key: "A50rbJg3TMPACbzE5Ujg0clx+d4udBAtggqEQiB7v9Sc" }, mode_info: { single: { mode: "SIGN_MODE_DIRECT" } }, sequence: "0" }], fee: { amount: [], gas_limit: "0", payer: "", granter: "" } }, signatures: ["1JsQFlr80kizUs04uUmBKFLgm1qVJlLoJa8oiarVc8ML9HYrfv6l1WeQZXVmsKVq0q9mq1jJk+glBPifEh53LAE="] };
const keySeed = { secret: "october pride genuine harvest reunion sight become tuna kingdom punch girl lizard cat crater fee emotion seat test output safe volume caught design soft", privateKey: "e54bff83fc945cba77ca3e45d69adc5b57ad8db6073736c8422692abecfb5fe2", publicKey: "049d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c1adb92ef31b067e67e77dc77061f76bb52fe4dfa85667f27657610a77429a09b", compressedPublicKey: "039d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c", address: "0xbf657D0ef7b48167657A703Ed8Fd063F075246D7", bip39Address: "evmos1hajh6rhhkjqkwet6wqld3lgx8ur4y3khjuxkxh" };
const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

let init = async function () {
  console.log("argv:", JSON.stringify(argv), "platform:", platform);
  try {
    // 读取配置文件
    let config;
    try {
      config = await fs.readJson("./config.json");
    } catch (error) {
      config = await fs.readJson("./config.default.json");
    }

    if (await fs.pathExists(scriptStop)) {
      console.log("Try to stop the evmosd under the nodes directory");
      await execPromis(scriptStop, { cwd: nodesDir }); // Anyway, stop it first
      await sleep(300);
    }
    if (!fs.existsSync(evmosd) || isCompile) {
      console.log("Start recompiling evmosd...");
      let make = await execPromis("go build ../cmd/evmosd", { cwd: curDir });
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

    console.log("Start cleaning up folder nodes");
    await fs.emptyDir(nodesDir);
    await fs.ensureDir(nodesDir);
    console.log("Folder nodes has been cleaned up");
    {
      const initFiles = `${platform !== "win32" ? "./" : ""}${evmosd} testnet init-files --v ${nodesCount} --output-dir ./nodes --chain-id evmos_20191205-1 --keyring-backend test`;
      const initFilesValidator = `${platform !== "win32" ? "./" : ""}${evmosd} testnet init-files --v ${validators} --output-dir ./nodes --chain-id evmos_20191205-1 --keyring-backend test`;
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

      await fs.writeJSON(path.join(nodesDir, `node0/evmosd/config/node_key.json`), nodeKey);
      await fs.writeJSON(path.join(nodesDir, `node0/evmosd/config/priv_validator_key.json`), privValidatorKey);
      await fs.outputJSON(path.join(nodesDir, `node0/evmosd/key_seed.json`), keySeed);
      const keyringPath = path.join(nodesDir, `node0/evmosd/keyring-test`);
      await fs.emptyDir(keyringPath);
      await fs.writeFile(path.join(keyringPath, `bf657d0ef7b48167657a703ed8fd063f075246d7.address`), "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMi0wOC0yNCAxODowOTowNC43NjQ4NTEgKzA4MDAgQ1NUIG09KzAuMjI4NTE5MjUxIiwiZW5jIjoiQTI1NkdDTSIsInAyYyI6ODE5MiwicDJzIjoiVHM3QXhNRmV4MlZtMTZpeiJ9.OrWluGLeod9SjmLDqvXTcA63z9P1VZ-D0l5LFzwVOhJG67vl3b0HXQ.BrINO_FqPHviDFff.yk2tJKWkWIo-OXZfxr7INBATtLws_mHvT5s4kSfwDkbpp2JJVyoEwFcozQHp5hh9owc3bPG7HRa_QHQarB5_Oz-fXJkuPlTxR955P6azI1C8vuWqBcZ7nfZkAhoFHgSZzQAPuFp6sPTWoDampAqocmtWu2lYPSiRnDHRZ6gEmP1slwsRwJTlASEwpmzjBeDsqrwCn9cT_jNrI7ilWB4LBUUXAkkKVu-p1X9bkqo8yZ_UrFFR2rI.6rVArcxnth5pzzgbEtuHSQ");
      await fs.writeFile(path.join(keyringPath, `node0.info`), "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMi0wOC0yNCAxODowOTowNC43NTg1NjYgKzA4MDAgQ1NUIG09KzAuMjIyMjM0MDQzIiwiZW5jIjoiQTI1NkdDTSIsInAyYyI6ODE5MiwicDJzIjoicmk3MzV2Y3Fid2VkUF9JcCJ9.ht-BieDMdmkOBfb1saBx2nvBDaD9anNxP5RTirHIk-tHUXJr6HbeKA.FvpzGpaY6il86ngO.WwHd6HTneYvxg3KkEhsXx1_F_XkmzHqVJwSmQrnX9ZSg2L8ZCAxV6rvliuRwt30816o8tElb06qpp1krFGwGL_LvP1FtnOiX4GdJJxAyX1lgBgJQrhZuqKc6EEE78ArwUR1Mb6b3ax_6oV7IB42izg1ci2PP5bgXN-510EM9RrSi9fnVl3UMoAanoBL8NfJGYHo2Cusn_Y14yEnPDHxS96vTl7wZx_pZrjtapyQ9ktnDQHVBfsupIKmIYXSwpQ16FQ9G4eclfKGhit4uUFofdT0UMG1g_aQEGHt1nPG08w66w8PxmW8ma_D8yCQp0TW6m9pTLWODiCztorLucEr9RFW9mJLofi4pFdCuqHrGm_o.X06PXwtrfTMDgiQDIpPS0g");
    }

    await fs.copy(evmosd, `./nodes/${evmosd}`);

    let nodeIds = [];
    for (let i = 0; i < nodesCount; i++) {
      const nodeKey = await fs.readJSON(path.join(nodesDir, `node${i}/evmosd/config/node_key.json`));
      const nodeId = tenderKeys.getBurrowAddressFromPrivKey(Buffer.from(nodeKey.priv_key.value, "base64").toString("hex"));
      nodeIds.push(nodeId);

      const keySeedPath = path.join(nodesDir, `node${i}/evmosd/key_seed.json`);
      let curKeySeed = await fs.readJSON(keySeedPath);
      const wallet = Wallet.fromMnemonic(curKeySeed.secret);
      curKeySeed.privateKey = wallet._signingKey().privateKey.toLowerCase().replace("0x", "");
      curKeySeed.publicKey = wallet._signingKey().publicKey.toLowerCase().replace("0x", "");
      curKeySeed.compressedPublicKey = wallet._signingKey().compressedPublicKey.toLowerCase().replace("0x", "");
      curKeySeed.address = wallet.address;
      curKeySeed.bip39Address = ethToEvmos(wallet.address);
      await fs.outputJson(keySeedPath, curKeySeed, { spaces: 2 });

      const address = "evmos1qqqqhe5pnaq5qq39wqkn957aydnrm45sdn8583"; // 0x00000be6819f41400225702d32d3dd23663dd690
      const account = {
        "@type": "/ethermint.types.v1.EthAccount",
        base_account: {
          address,
          pub_key: null,
          account_number: "0",
          sequence: "0",
        },
        code_hash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      };
      const balance = {
        address,
        coins: [
          {
            denom: "agov",
            amount: "100000000000000000000000000",
          },
        ],
      };
      const evmosCoin = {
        denom: "aevmos",
        amount: "100000000000000000000000000",
      };

      const genesisPath = path.join(nodesDir, `node${i}/evmosd/config/genesis.json`);
      let genesis = await fs.readJSON(genesisPath);
      let appState = genesis.app_state;
      appState.auth.accounts.push(account);
      appState.bank.balances.push(balance);
      // appState.crisis.constant_fee.denom = "agov"
      for (let balances of appState.bank.balances) {
        balances.coins.unshift(evmosCoin);
      }
      appState.gov.deposit_params.max_deposit_period = config.maxDepositPeriod;
      appState.gov.voting_params.voting_period = config.votingPeriod;
      appState.inflation.params.mint_denom = config.mintDenom;

      appState.auth.accounts[0].base_account.address = keySeed.bip39Address;
      appState.bank.balances[0].address = keySeed.bip39Address;
      appState.genutil.gen_txs[0] = createValidator;

      await fs.outputJson(genesisPath, genesis, { spaces: 2 });
    }

    for (let i = 0; i < nodesCount; i++) {
      let data;
      const appConfigPath = path.join(nodesDir, `node${i}/evmosd/config/app.toml`);
      const swaggerPort = config.swaggerPort || 1317;
      const rosettaPort = config.rosettaPort || 8080;
      const grpcPort = config.grpcPort || 9090;
      const grpcWebPort = config.grpcWebPort || 9091;
      const jsonRpcPort = config.jsonRpcPort || 8545;
      const wsRpcPort = config.wsRpcPort || 8546;
      data = await fs.readFile(appConfigPath, "utf8");
      data = data.replace("tcp://0.0.0.0:1317", `tcp://0.0.0.0:${swaggerPort + i}`);
      data = data.replace("swagger = false", `swagger = true`);
      data = data.replaceAll("enabled-unsafe-cors = false", `enabled-unsafe-cors = true`);
      // data = data.replaceAll("enable = false", `enable = true`) // on rosetta enable is false, and we need is false
      data = data.replace(":8080", `:${rosettaPort + i}`);
      data = data.replace("0.0.0.0:9090", `0.0.0.0:${grpcPort - i}`);
      data = data.replace("0.0.0.0:9091", `0.0.0.0:${grpcWebPort + i}`);
      data = data.replace("0.0.0.0:8545", `0.0.0.0:${jsonRpcPort - i}`);
      data = data.replace("0.0.0.0:8546", `0.0.0.0:${wsRpcPort + i}`);
      data = data.replace("eth,net,web3", `eth,txpool,personal,net,debug,web3`);
      await fs.writeFile(appConfigPath, data);

      const configPath = path.join(nodesDir, `node${i}/evmosd/config/config.toml`);
      const rpcServerPort = config.rpcServerPort || 26657;
      const p2pPort = config.p2pPort || 10000;
      const pprofPort = config.pprofPort || 6060;
      data = await fs.readFile(configPath, "utf8");
      data = data.replace("0.0.0.0:26657", `0.0.0.0:${rpcServerPort + i}`);
      data = data.replaceAll("cors_allowed_origins = []", `cors_allowed_origins = ["*"]`);
      data = data.replaceAll("allow_duplicate_ip = false", `allow_duplicate_ip = true`);
      data = data.replace("tcp://0.0.0.0:26656", `tcp://0.0.0.0:${p2pPort + i}`);
      data = data.replace("localhost:6060", `localhost:${pprofPort + i}`);
      data = data.replace("40f4fac63da8b1ce8f850b0fa0f79b2699d2ce72@seed.evmos.jerrychong.com:26656,e3e11fca4ecf4035a751f3fea90e3a821e274487@bd-evmos-mainnet-seed-node-01.bdnodes.net:26656,fc86e7e75c5d2e4699535e1b1bec98ae55b16826@bd-evmos-mainnet-seed-node-02.bdnodes.net:26656", ``);

      // replace persistent_peers
      let peers = [];
      const str = `persistent_peers = "`;
      const indexStart = data.indexOf(str);
      const indexEnd = data.indexOf(`"`, indexStart + str.length);
      let oldPeers = data.substring(indexStart + str.length, indexEnd);
      for (let j = 0; j < nodesCount && nodesCount > 1; j++) {
        if (i != j) {
          peers.push(`${nodeIds[j]}@127.0.0.1:${p2pPort + j}`);
        }
      }
      if (oldPeers.length > 0) {
        data = data.replace(oldPeers, peers.join());
      } else {
        data = data.replace(`persistent_peers = ""`, `persistent_peers = "${peers.join()}"`); // if validator == 1 && common node >= 1
      }
      await fs.writeFile(configPath, data);
    }

    // 生成启动命令脚本
    let vbsStart = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
    let vbsStop = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
    for (let i = 0; i < nodesCount; i++) {
      let p2pPort = config.p2pPort + i;
      let start = (platform == "win32" ? "" : "#!/bin/bash\n") + (isNohup && platform !== "win32" ? "nohup " : "") + (platform !== "win32" ? "./" : "") + `${evmosd} start --home ./node${i}/evmosd/` + (isNohup && platform !== "win32" ? ` >./evmos${i}.log 2>&1 &` : "");
      let stop =
        platform == "win32"
          ? `@echo off
for /f "tokens=5" %%i in ('netstat -ano ^| findstr 0.0.0.0:${p2pPort}') do set PID=%%i
taskkill /F /PID %PID%`
          : platform == "linux"
          ? `pid=\`netstat -anp | grep :::${p2pPort} | awk '{printf $7}' | cut -d/ -f1\`;
    kill -15 $pid`
          : `pid=\`lsof -i :${p2pPort} | grep evmosd | grep LISTEN | awk '{printf $2}'|cut -d/ -f1\`;
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

    if (isStart) {
      console.log("Start all evmosd node under the folder nodes");
      await execPromis(scriptStart, { cwd: nodesDir }); // 不管怎样先执行一下停止
    }
  } catch (error) {
    console.log("error", error);
  }
};

init();
