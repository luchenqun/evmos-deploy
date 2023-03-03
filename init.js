import { Wallet } from "@ethersproject/wallet";
import { ethToEvmos } from "@tharsis/address-converter";
import { exec } from "child_process";
import download from "download";
import fs from "fs-extra";
import path from "path";
import os from "os";
import util from "util";
import _yargs from "yargs";
import { hideBin } from "yargs/helpers";
import TenderKeys from "./tenderKeys.js";
import { ethToBech32 } from "./utils.js";

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
const arch = os.arch();
const execPromis = util.promisify(exec);
const curDir = process.cwd();
const nodesDir = path.join(curDir, "nodes");
const evmosd = platform == "win32" ? "evmosd.exe" : "evmosd";
const gaiad = platform == "win32" ? "gaiad.exe" : "gaiad";
const gaiadCmd = platform == "win32" ? "gaiad.exe" : "./gaiad";
const gaiaHome = "./nodes/gaia";
const gaiaChainId = "cosmoshub-test";
let gaiaP2pPort = 16656;
let quarixChainId = "quarix_88888888-1";
const rly = platform == "win32" ? "rly.exe" : "rly";
const rlyCmd = platform == "win32" ? "rly.exe" : "./rly";
const rlyHome = "./nodes/relayer";
let rlyCfg = `
global:
    api-listen-addr: :5183
    timeout: 10s
    memo: "rly"
    light-cache-size: 20
chains:
    ibc-0:
        type: cosmos
        value:
            key: testkey
            chain-id: ${quarixChainId}
            rpc-addr: http://localhost:26657
            account-prefix: evmos
            keyring-backend: test
            gas-adjustment: 1.5
            gas-prices: 1akgas
            min-gas-amount: 0
            debug: true
            timeout: 10s
            output-format: json
            sign-mode: direct
    ibc-1:
        type: cosmos
        value:
            key: testkey
            chain-id: cosmoshub-test
            rpc-addr: http://localhost:16657
            account-prefix: cosmos
            keyring-backend: test
            gas-adjustment: 1.5
            gas-prices: 0uatom
            min-gas-amount: 0
            debug: true
            timeout: 10s
            output-format: json
            sign-mode: direct
paths:
    demo:
        src:
            chain-id: ${quarixChainId}
        dst:
            chain-id: cosmoshub-test
        src-channel-filter:
            rule: ""
            channel-list: []
`;

const ibcTransfer = `
#!/bin/bash

./rly tx link demo --client-tp 500s -d -t 3s --home ./relayer
sleep 5

echo "==================>before transfer"
./rly q bal ibc-0 --home ./relayer
./rly q bal ibc-1 --home ./relayer

./rly tx transfer ibc-0 ibc-1 5000000000000000000akgov "$(./rly keys show ibc-1 --home ./relayer)" channel-0 -d --home ./relayer
sleep 5
./rly tx relay-packets demo channel-0 -d --home ./relayer
sleep 5
./rly tx relay-acknowledgements demo channel-0 -d --home ./relayer
sleep 5

echo "==================>after transfer"
./rly q bal ibc-0 --home ./relayer
./rly q bal ibc-1 --home ./relayer


./rly tx transfer ibc-1 ibc-0 2000000000000000000transfer/channel-0/akgov "$(rly keys show ibc-0 --home ./relayer)" channel-0 -d --home ./relayer
sleep 5
./rly tx relay-packets demo channel-0 -d --home ./relayer
sleep 5
./rly tx relay-acknowledgements demo channel-0 -d --home ./relayer
sleep 5

echo "==================>back transfer"
./rly q bal ibc-0 --home ./relayer
./rly q bal ibc-1 --home ./relayer

./rly tx transfer ibc-1 ibc-0 1000000000000000000uatom "$(./rly keys show ibc-0 --home ./relayer)" channel-0 -d --home ./relayer
sleep 5
./rly tx relay-packets demo channel-0 -d --home ./relayer
sleep 5
./rly tx relay-acknowledgements demo channel-0 -d --home ./relayer
sleep 5
`;

let clientCfg = `
# The network chain ID
chain-id = "${quarixChainId}"
# The keyring's backend, where the keys are stored (os|file|kwallet|pass|test|memory)
keyring-backend = "test"
# CLI output format (text|json)
output = "text"
# <host>:<port> to Tendermint RPC interface for this chain
node = "tcp://localhost:26657"
# Transaction broadcasting mode (sync|async|block)
broadcast-mode = "sync"
`;
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
    let config;
    try {
      config = await fs.readJson("./config.json");
    } catch (error) {
      config = await fs.readJson("./config.default.json");
    }
    const { app, tendermint, preMinePerAccount, fixedFirstValidator, preMineAccounts, ibc } = config;
    gaiaP2pPort = ibc.tendermint["p2p.laddr"].split(":").pop().split(`"`)[0];
    if (app.chain_id) {
      rlyCfg = rlyCfg.replaceAll(quarixChainId, app.chain_id);
      clientCfg = clientCfg.replaceAll(quarixChainId, app.chain_id);
      quarixChainId = app.chain_id;
    }

    if (ibc.enable && !fs.existsSync(rly)) {
      try {
        console.log("begin download relayer.....");
        const rlyUrl = `https://github.com/cosmos/relayer/releases/download/v2.1.2/Cosmos.Relayer_2.1.2_${platform}_${arch}.tar.gz`;
        await download(rlyUrl, "./relayer", { extract: true });
        await fs.copyFile("./relayer/Cosmos Relayer", `./${rly}`);
      } catch (error) {}
    }

    if (ibc.enable && !fs.existsSync(rly)) {
      console.warn("relayer is not exist, please go to https://github.com/cosmos/relayer/releases download and extract rename executable program to rly");
      return;
    } else if (fs.existsSync(rly)) {
      await fs.chmod(rly, 0o777);
    }

    if (ibc.enable && !fs.existsSync(gaiad)) {
      try {
        console.log("begin download gaiad.....");
        const gaiadUrl = `https://github.com/cosmos/gaia/releases/download/v7.1.0/gaiad-v7.1.0-${platform}-${arch}`;
        await download(gaiadUrl, ".", { filename: gaiad });
      } catch (error) {}
    }

    if (ibc.enable && !fs.existsSync(gaiad)) {
      console.warn("gaiad is not exist, please go to https://github.com/cosmos/gaia/releases download and extract rename executable program to gaiad");
      return;
    } else if (fs.existsSync(gaiad)) {
      await fs.chmod(gaiad, 0o777);
    }

    const nodeKey = { priv_key: { type: "tendermint/PrivKeyEd25519", value: "TbxbG++2jqiXy+AeM2OGzKfV1ZyTIPGrF5lSQQbfmZIFlGgxIvA8XOPYiaof1fMLpOCW+Jawm6xJzvZIgq9B/g==" } };
    const privValidatorKey = { address: "2DFA4082F0B93D32CEDB55358D99E359FEA7042A", pub_key: { type: "tendermint/PubKeyEd25519", value: "rzpeRX+IiTeO9jQzlu6KmMLNCKSRCXcRk4Q7UXJ+Ffo=" }, priv_key: { type: "tendermint/PrivKeyEd25519", value: "RCGwFQ40lR0Vf0Twgok++xjEaxSbtLJP4Z6/7/FXb5KvOl5Ff4iJN472NDOW7oqYws0IpJEJdxGThDtRcn4V+g==" } };
    const createValidator = { body: { messages: [{ "@type": "/cosmos.staking.v1beta1.MsgCreateValidator", description: { moniker: "node0", identity: "", website: "", security_contact: "", details: "" }, commission: { rate: "0.100000000000000000", max_rate: "1.000000000000000000", max_change_rate: "1.000000000000000000" }, min_self_delegation: "1", delegator_address: "quarix1hajh6rhhkjqkwet6wqld3lgx8ur4y3khmpfhlu", validator_address: "quarixvaloper1hajh6rhhkjqkwet6wqld3lgx8ur4y3khajuzj7", pubkey: { "@type": "/cosmos.crypto.ed25519.PubKey", key: "rzpeRX+IiTeO9jQzlu6KmMLNCKSRCXcRk4Q7UXJ+Ffo=" }, value: { denom: "akgov", amount: "100000000000000000000" } }], memo: "294c280ccfaa8514aec3a01c9bc819cbe6a85e57@192.168.0.1:26656", timeout_height: "0", extension_options: [], non_critical_extension_options: [] }, auth_info: { signer_infos: [{ public_key: { "@type": "/ethermint.crypto.v1.ethsecp256k1.PubKey", key: "A50rbJg3TMPACbzE5Ujg0clx+d4udBAtggqEQiB7v9Sc" }, mode_info: { single: { mode: "SIGN_MODE_DIRECT" } }, sequence: "0" }], fee: { amount: [], gas_limit: "0", payer: "", granter: "" }, tip: null }, signatures: ["vKMwRna4ij/47kVUvHGLeIpO/bVcxiVnN/tOh4ug5+hhZMWD36rhjS2hhG7Kw1QtxgH1wMirfR5x0zLaC0lqhQA="] };
    const keySeed = { secret: "october pride genuine harvest reunion sight become tuna kingdom punch girl lizard cat crater fee emotion seat test output safe volume caught design soft", privateKey: "e54bff83fc945cba77ca3e45d69adc5b57ad8db6073736c8422692abecfb5fe2", publicKey: "049d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c1adb92ef31b067e67e77dc77061f76bb52fe4dfa85667f27657610a77429a09b", compressedPublicKey: "039d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c", address: "0xbf657D0ef7b48167657A703Ed8Fd063F075246D7", bip39Address: "quarix1hajh6rhhkjqkwet6wqld3lgx8ur4y3khmpfhlu" };
    if (await fs.pathExists(scriptStop)) {
      console.log("Try to stop the evmosd under the nodes directory");
      await execPromis(scriptStop, { cwd: nodesDir }); // Anyway, stop it first
      await sleep(platform == "win32" ? 600 : 300);
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

    // begin init gaia
    if (ibc.enable) {
      await execPromis(`${gaiadCmd} init gaia --chain-id ${gaiaChainId} --home ${gaiaHome}`, { cwd: curDir });
      await execPromis(`${gaiadCmd} keys add validator --keyring-backend=test --output json --home ${gaiaHome} > ${gaiaHome}/validator_seed.json 2>&1`, { cwd: curDir });
      await execPromis(`${gaiadCmd} keys add user --keyring-backend=test --output json --home ${gaiaHome} > ${gaiaHome}/key_seed.json 2>&1`, { cwd: curDir });
      const validatorAddress = (await fs.readJSON(`${gaiaHome}/validator_seed.json`)).address;
      const userAddress = (await fs.readJSON(`${gaiaHome}/key_seed.json`)).address;
      await execPromis(`${gaiadCmd} add-genesis-account ${validatorAddress} 100000000000000000000000000uatom --home ${gaiaHome}`, { cwd: curDir });
      await execPromis(`${gaiadCmd} add-genesis-account ${userAddress} 100000000000000000000000000uatom --home ${gaiaHome}`, { cwd: curDir });
      await execPromis(`${gaiadCmd} gentx validator 1000000000000000000uatom --keyring-backend=test --chain-id ${gaiaChainId} --home ${gaiaHome}`, { cwd: curDir });
      await execPromis(`${gaiadCmd} collect-gentxs --home ${gaiaHome}`, { cwd: curDir });

      let data;
      const appConfigPath = `${gaiaHome}/config/app.toml`;
      data = await fs.readFile(appConfigPath, "utf8");
      data = updateCfg(data, ibc.app);
      await fs.writeFile(appConfigPath, data);

      const configPath = `${gaiaHome}/config/config.toml`;
      data = await fs.readFile(configPath, "utf8");
      data = updateCfg(data, ibc.tendermint);
      await fs.writeFile(configPath, data);

      const genesisPath = `${gaiaHome}/config/genesis.json`;
      data = await fs.readFile(genesisPath, "utf8");
      data = data.replaceAll("stake", `uatom`);
      await fs.writeFile(genesisPath, data);
    }

    {
      const initFiles = `${platform !== "win32" ? "./" : ""}${evmosd} testnet init-files --v ${nodesCount} --output-dir ./nodes --chain-id ${quarixChainId} --keyring-backend test`;
      const initFilesValidator = `${platform !== "win32" ? "./" : ""}${evmosd} testnet init-files --v ${validators} --output-dir ./nodes --chain-id ${quarixChainId} --keyring-backend test`;
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
        await fs.writeFile(path.join(keyringPath, `bf657d0ef7b48167657a703ed8fd063f075246d7.address`), "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMy0wMi0yOCAxMDo0NzozNy40NTg3OTIgKzA4MDAgQ1NUIG09KzAuMDkxNzIxMjEwIiwiZW5jIjoiQTI1NkdDTSIsInAyYyI6ODE5MiwicDJzIjoiOVZpd19DYVJ3Q3pDLWRacCJ9.BAhbfdC-jKLcjge_OUk3lFBu8se1Hd9U64i2mtyREu6VWe8ziMTS3w.lFVcRtSjI5Zmuo6Y.CZOtd0xis0pVFQ_TK5OjtivnA2dSxR7vrgehEgkmIQW01dC5vfR_E-WOvD_gZwHhr-P_a4KmD0Bc2mug13HD-JLWgJ4XQF2_2u_i-yUy78C1EalB-xip78rlIbTaNgVWAB-rOfpZ3hPg9IYXTX3ljOE-Fk9cGXxnX4hdnb4L5aM0tKc9VgF-A89_IjDUVWanfxeGBS0Vc3A-_PTOq87oaOEIMmD-dn1TmGZqY4-5qRRrJ1dBwJE.c9Ts1ddVXsGel2W-PdVLRg");
        await fs.writeFile(path.join(keyringPath, `node0.info`), "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMy0wMi0yOCAxMDo0NzozNy40NTczODUgKzA4MDAgQ1NUIG09KzAuMDkwMzE1MDAxIiwiZW5jIjoiQTI1NkdDTSIsInAyYyI6ODE5MiwicDJzIjoiOTRUY1YyWHJUTjNpX0F5biJ9.Dr_KgdaI6RIk5eTuinQCoZAQdY1BAOA38fI68Z01yPmp3rwaUk7Eaw.kJJlSQMtovL92uIt.s0CT-DsyuJzMSLyTdU6DXy-SWctxD-lOMNcW88MmHbrejCzA51_u4v652n8hA0c6e27OVZZU0ScR9XhVpY2okWAzYACxKn17X5cStHj0LLwjAt2uCgz9g8ufoWsLxWX403SD6fpjL7J_URY1c8VbYiwDbXOT3_90NWTyPh_5U3THgAxXZ0t_hLEMAQzXU5xiFwsLPB3hH4ZI6YCzCMnapLYRgp0OSDP8YWTv8F7vUeOftPZkSW2dVIGfDukrAd7GqOjSdu_J9iVeL1ahot1LBRxlRLSBW2EkOrJRAjjOlW9tX4CLU8ZRm6CQjTmSsnO_sdrGZloluh0MPVRHIrQJuWB9TN7HoDmRwtylaDmN6c2uYVWk_1bW21wNaR4U9To5njVA_KF_c_45zvlRlvsi5O7wbJkoOtW5aCxYRMvf2srtLggpNQ_XNIXezsv7kNmjR_4WuXGu-fe2hC5POTpLIPQvFp4.kdqMWwmrRgflkRXmVcBAww");
      }
    }

    await fs.copy(evmosd, `./nodes/${evmosd}`);
    if (ibc.enable) {
      await fs.copy(gaiad, `./nodes/${gaiad}`);
      await fs.copy(rly, `./nodes/${rly}`);
    }

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
      curKeySeed.bip39Address = ethToBech32(wallet.address, "quarix");
      await fs.outputJson(keySeedPath, curKeySeed, { spaces: 2 });
    }

    const account = { "@type": "/ethermint.types.v1.EthAccount", base_account: { address: "", pub_key: null, account_number: "0", sequence: "0" }, code_hash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470" };
    const balance = { address: "", coins: [{ denom: "akgov", amount: "0" }] };
    for (let i = 0; i < nodesCount; i++) {
      let accounts = [];
      let balances = [];
      if (Array.isArray(preMineAccounts)) {
        for (const address of preMineAccounts) {
          accounts.push(Object.assign(JSON.parse(JSON.stringify(account)), { base_account: { address } }));
          balances.push(Object.assign(JSON.parse(JSON.stringify(balance)), { address }));
        }
      }
      // const evmosCoin = {
      //   denom: "akgas",
      //   amount: "0",
      // };

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
        // use balances.coins.unshift(evmosCoin) will modify appState.bank.balances[0].coins[1]
        balances.coins.unshift({
          denom: "akgas",
          amount: "0",
        });
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

      await fs.outputJson(genesisPath, genesis, { spaces: 2 });
    }

    // update app.toml and config.toml and client.toml
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

    if (ibc.enable) {
      await fs.ensureFile(path.join(rlyHome, "config/config.yaml"));
      await fs.writeFile(path.join(rlyHome, "config/config.yaml"), rlyCfg);

      let keySeed;
      keySeed = await fs.readJSON(path.join(nodesDir, `node0/evmosd/key_seed.json`));
      await execPromis(`${rlyCmd} keys restore ibc-0 testkey "${keySeed.secret}" --coin-type 60 --home ${rlyHome}`, { cwd: curDir });
      keySeed = await fs.readJSON(`${gaiaHome}/key_seed.json`);
      await execPromis(`${rlyCmd} keys restore ibc-1 testkey "${keySeed.mnemonic}" --home ${rlyHome}`, { cwd: curDir });
    }

    // 生成启动命令脚本
    let vbsStart = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
    let vbsStop = platform == "win32" ? `set ws=WScript.CreateObject("WScript.Shell")\n` : `#!/bin/bash\n`;
    for (let i = 0; i < nodesCount; i++) {
      let p2pPort = tendermint.port["p2p.laddr"] + i;
      let start = (platform == "win32" ? "" : "#!/bin/bash\n") + (isNohup && platform !== "win32" ? "nohup " : "") + (platform !== "win32" ? "./" : "") + `${evmosd} start --keyring-backend test --home ./node${i}/evmosd/` + (isNohup && platform !== "win32" ? ` >./evmos${i}.log 2>&1 &` : "");
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

    if (ibc.enable) {
      let start = (platform == "win32" ? "" : "#!/bin/bash\n") + (isNohup && platform !== "win32" ? "nohup " : "") + `${gaiadCmd} start --home ./gaia` + (isNohup && platform !== "win32" ? ` >./gaia.log 2>&1 &` : "");
      let stop =
        platform == "win32"
          ? `@echo off
for /f "tokens=5" %%i in ('netstat -ano ^| findstr 0.0.0.0:${gaiaP2pPort}') do set PID=%%i
taskkill /F /PID %PID%`
          : platform == "linux"
          ? `pid=\`netstat -anp | grep :::${gaiaP2pPort} | awk '{printf $7}' | cut -d/ -f1\`;
    kill -15 $pid`
          : `pid=\`lsof -i :${gaiaP2pPort} | grep ${gaiad} | grep LISTEN | awk '{printf $2}' | cut -d/ -f1\`;
    if [ "$pid" != "" ]; then kill -15 $pid; fi`;
      let startPath = path.join(nodesDir, platform == "win32" ? "startGaia.bat" : "startGaia.sh");
      let stopPath = path.join(nodesDir, platform == "win32" ? "stopGaia.bat" : "stopGaia.sh");
      await fs.writeFile(startPath, start);
      await fs.writeFile(stopPath, stop);

      if (platform == "win32") {
        vbsStart += `ws.Run ".\\startGaia.bat",0\n`;
        vbsStop += `ws.Run ".\\stopGaia.bat",0\n`;
      } else {
        vbsStart += `./startGaia.sh\n`;
        vbsStop += `./stopGaia.sh\n`;
        await fs.chmod(startPath, 0o777);
        await fs.chmod(stopPath, 0o777);
      }
    }
    if (ibc.enable) {
      const sleep3s = platform == "win32" ? `TIMEOUT /T 3 /NOBREAK` : `#!/bin/bash\nsleep 3`;
      const nohubStr = isNohup && platform !== "win32" ? "nohup" : "";
      const nohubLog = isNohup && platform !== "win32" ? `>./relayer.log 2>&1 &` : "";
      let start = `${sleep3s}\n${nohubStr} ${rlyCmd} tx link demo -d -t 3s --client-tp 500s --home ./relayer ${nohubLog}`;
      // start = `${start}\n${nohubStr} ${rlyCmd} start --home ./relayer ${nohubLog}`;
      let stop =
        platform == "win32"
          ? `@echo off
for /f "tokens=5" %%i in ('netstat -ano ^| findstr ${rly}') do set PID=%%i
taskkill /F /PID %PID%`
          : platform == "linux"
          ? `pid=\`ps -ef | grep "rly start" | grep -v grep | awk '{printf $2}' | cut -d/ -f1\`;
    kill -15 $pid`
          : `pid=\`ps -ef | grep "rly start" | grep -v grep | awk '{printf $2}' | cut -d/ -f1\`;
    if [ "$pid" != "" ]; then kill -15 $pid; fi`;
      let startPath = path.join(nodesDir, platform == "win32" ? "startRly.bat" : "startRly.sh");
      let stopPath = path.join(nodesDir, platform == "win32" ? "stopRly.bat" : "stopRly.sh");
      let ibcTransrerPath = path.join(nodesDir, platform == "win32" ? "ibcTransrer.bat" : "ibcTransrer.sh");
      await fs.writeFile(startPath, start);
      await fs.writeFile(stopPath, stop);
      await fs.writeFile(ibcTransrerPath, ibcTransfer);

      if (platform == "win32") {
        vbsStart += `ws.Run ".\\startRly.bat",0\n`;
        // vbsStop += `ws.Run ".\\stopRly.bat",0\n`;
      } else {
        vbsStart += `./startRly.sh\n`;
        // vbsStop += `./stopRly.sh\n`;
        await fs.chmod(startPath, 0o777);
        await fs.chmod(stopPath, 0o777);
        await fs.chmod(ibcTransrerPath, 0o777);
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
