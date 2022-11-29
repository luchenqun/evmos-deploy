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
const gaiaP2pPort = 16656;
const gaiaRpcPort = 16657;
const evmosChainId = "evmos_20191205-1";
const rly = platform == "win32" ? "rly.exe" : "rly";
const rlyCmd = platform == "win32" ? "rly.exe" : "./rly";
const rlyHome = "./nodes/relayer";
const rlyCft = `
global:
    api-listen-addr: :5183
    timeout: 10s
    memo: ""
    light-cache-size: 20
chains:
    ibc-0:
        type: cosmos
        value:
            key: testkey
            chain-id: evmos_20191205-1
            rpc-addr: http://localhost:26657
            account-prefix: evmos
            keyring-backend: test
            gas-adjustment: 1.5
            gas-prices: 1aevmos
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
            chain-id: evmos_20191205-1
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

./rly tx transfer ibc-0 ibc-1 5000000000000000000agov "$(./rly keys show ibc-1 --home ./relayer)" channel-0 -d --home ./relayer
sleep 5
./rly tx relay-packets demo channel-0 -d --home ./relayer
sleep 5
./rly tx relay-acknowledgements demo channel-0 -d --home ./relayer
sleep 5

echo "==================>after transfer"
./rly q bal ibc-0 --home ./relayer
./rly q bal ibc-1 --home ./relayer


./rly tx transfer ibc-1 ibc-0 2000000000000000000transfer/channel-0/agov "$(rly keys show ibc-0 --home ./relayer)" channel-0 -d --home ./relayer
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
const scriptStop = path.join(nodesDir, platform == "win32" ? "stopAll.vbs" : "stopAll.sh");
const scriptStart = path.join(nodesDir, platform == "win32" ? "startAll.vbs" : "startAll.sh");
const tenderKeys = new TenderKeys();
const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
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
    const { govCoin, preMinePerAccount, fixedFirstValidator, preMineAccounts, ibc } = config;

    if (ibc && !fs.existsSync(rly)) {
      try {
        console.log("begin download relayer.....");
        const rlyUrl = `https://github.com/cosmos/relayer/releases/download/v2.1.2/Cosmos.Relayer_2.1.2_${platform}_${arch}.tar.gz`;
        await download(rlyUrl, "./relayer", { extract: true });
        await fs.copyFile("./relayer/Cosmos Relayer", `./${rly}`);
      } catch (error) {}
    }

    if (ibc && !fs.existsSync(rly)) {
      console.warn("relayer is not exist, please go to https://github.com/cosmos/relayer/releases download and extract rename executable program to rly");
      return;
    } else {
      await fs.chmod(rly, 0o777);
    }

    if (ibc && !fs.existsSync(gaiad)) {
      try {
        console.log("begin download gaiad.....");
        const gaiadUrl = `https://github.com/cosmos/gaia/releases/download/v7.1.0/gaiad-v7.1.0-${platform}-${arch}`;
        await download(gaiadUrl, ".", { filename: gaiad });
      } catch (error) {}
    }

    if (ibc && !fs.existsSync(gaiad)) {
      console.warn("gaiad is not exist, please go to https://github.com/cosmos/gaia/releases download and extract rename executable program to gaiad");
      return;
    } else {
      await fs.chmod(gaiad, 0o777);
    }

    const nodeKey = { priv_key: { type: "tendermint/PrivKeyEd25519", value: "bq6XFN3gT1s5TR4uvEZo71VK2XrKdaQ1ecXKXOPEr8q0wRHFwEwP97pmwewLjtHDTYok5rS4T9751MaSIlS6Vg==" } };
    const privValidatorKey = { address: "A8BF37F9C6EAE0E808319460EDD5A3D714613D7A", pub_key: { type: "tendermint/PubKeyEd25519", value: "caL9Bf7Mnrony4HOYgKo5JSCYLyNyTUyt+pw+vbmjdw=" }, priv_key: { type: "tendermint/PrivKeyEd25519", value: "jH2WRl02s7AIhqCJqYmnBl+atc7aXZnhb5DQCk3FbR1xov0F/syeuifLgc5iAqjklIJgvI3JNTK36nD69uaN3A==" } };
    const createValidator = { body: { messages: [{ "@type": "/cosmos.staking.v1beta1.MsgCreateValidator", description: { moniker: "node0", identity: "", website: "", security_contact: "", details: "" }, commission: { rate: "0.100000000000000000", max_rate: "1.000000000000000000", max_change_rate: "0.100000000000000000" }, min_self_delegation: "1", delegator_address: "evmos1hajh6rhhkjqkwet6wqld3lgx8ur4y3khjuxkxh", validator_address: "evmosvaloper1hajh6rhhkjqkwet6wqld3lgx8ur4y3khljfx82", pubkey: { "@type": "/cosmos.crypto.ed25519.PubKey", key: "caL9Bf7Mnrony4HOYgKo5JSCYLyNyTUyt+pw+vbmjdw=" }, value: { denom: govCoin ? "agov" : "aevmos", amount: "100000000000000000000" } }], memo: "90d5c044ed4938cfeac4f41635db3b88c894c21f@192.168.0.1:26656", timeout_height: "0", extension_options: [], non_critical_extension_options: [] }, auth_info: { signer_infos: [{ public_key: { "@type": "/ethermint.crypto.v1.ethsecp256k1.PubKey", key: "A50rbJg3TMPACbzE5Ujg0clx+d4udBAtggqEQiB7v9Sc" }, mode_info: { single: { mode: "SIGN_MODE_DIRECT" } }, sequence: "0" }], fee: { amount: [], gas_limit: "0", payer: "", granter: "" } }, signatures: [govCoin ? "T1TtcdJol2tNFXIjilXZiP3qHWHcUTEURKZ0PMYp7pJr0Y12aJX320EFVenNUbje2Mt/VPoiIu2tQbgx1ZXi4wA=" : "HApoRLTw6JHNj+813tn1aQb3JG5wJWV1MMDbKFPUdxRpp1eEnMI3VcK7qm+bhXT/U8RO738si4ww6x0lnVeCggA="] };
    const keySeed = { secret: "october pride genuine harvest reunion sight become tuna kingdom punch girl lizard cat crater fee emotion seat test output safe volume caught design soft", privateKey: "e54bff83fc945cba77ca3e45d69adc5b57ad8db6073736c8422692abecfb5fe2", publicKey: "049d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c1adb92ef31b067e67e77dc77061f76bb52fe4dfa85667f27657610a77429a09b", compressedPublicKey: "039d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c", address: "0xbf657D0ef7b48167657A703Ed8Fd063F075246D7", bip39Address: "evmos1hajh6rhhkjqkwet6wqld3lgx8ur4y3khjuxkxh" };
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
    if (ibc) {
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
      data = data.replace("tcp://0.0.0.0:1317", `tcp://0.0.0.0:11317`);
      data = data.replace("swagger = false", `swagger = true`);
      data = data.replaceAll("enabled-unsafe-cors = false", `enabled-unsafe-cors = true`);
      data = data.replaceAll("enable = false", `enable = true`);
      data = data.replace(":8080", `:18080`);
      data = data.replace("0.0.0.0:9090", `0.0.0.0:19090`);
      data = data.replace("0.0.0.0:9091", `0.0.0.0:19091`);
      config.pruning && (data = data.replace(`pruning = "default"`, `pruning = "${config.pruning}"`));
      await fs.writeFile(appConfigPath, data);

      const configPath = `${gaiaHome}/config/config.toml`;
      data = await fs.readFile(configPath, "utf8");
      data = data.replace("127.0.0.1:26657", `0.0.0.0:${gaiaRpcPort}`);
      data = data.replaceAll("cors_allowed_origins = []", `cors_allowed_origins = ["*"]`);
      data = data.replaceAll("allow_duplicate_ip = false", `allow_duplicate_ip = true`);
      // data = data.replaceAll("prometheus = false", `prometheus = true`);
      data = data.replace("tcp://0.0.0.0:26656", `tcp://0.0.0.0:${gaiaP2pPort}`);
      data = data.replace("localhost:6060", `localhost:16060`);
      data = data.replace(`timeout_propose = "3s"`, `timeout_propose = "1s"`);
      data = data.replace(`timeout_commit = "5s"`, `timeout_commit = "1s"`);
      await fs.writeFile(configPath, data);

      const genesisPath = `${gaiaHome}/config/genesis.json`;
      data = await fs.readFile(genesisPath, "utf8");
      data = data.replaceAll("stake", `uatom`);
      await fs.writeFile(genesisPath, data);
    }

    {
      const initFiles = `${platform !== "win32" ? "./" : ""}${evmosd} testnet init-files --v ${nodesCount} --output-dir ./nodes --chain-id ${evmosChainId} --keyring-backend test`;
      const initFilesValidator = `${platform !== "win32" ? "./" : ""}${evmosd} testnet init-files --v ${validators} --output-dir ./nodes --chain-id ${evmosChainId} --keyring-backend test`;
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
        await fs.writeFile(path.join(keyringPath, `bf657d0ef7b48167657a703ed8fd063f075246d7.address`), "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMi0wOC0yNCAxODowOTowNC43NjQ4NTEgKzA4MDAgQ1NUIG09KzAuMjI4NTE5MjUxIiwiZW5jIjoiQTI1NkdDTSIsInAyYyI6ODE5MiwicDJzIjoiVHM3QXhNRmV4MlZtMTZpeiJ9.OrWluGLeod9SjmLDqvXTcA63z9P1VZ-D0l5LFzwVOhJG67vl3b0HXQ.BrINO_FqPHviDFff.yk2tJKWkWIo-OXZfxr7INBATtLws_mHvT5s4kSfwDkbpp2JJVyoEwFcozQHp5hh9owc3bPG7HRa_QHQarB5_Oz-fXJkuPlTxR955P6azI1C8vuWqBcZ7nfZkAhoFHgSZzQAPuFp6sPTWoDampAqocmtWu2lYPSiRnDHRZ6gEmP1slwsRwJTlASEwpmzjBeDsqrwCn9cT_jNrI7ilWB4LBUUXAkkKVu-p1X9bkqo8yZ_UrFFR2rI.6rVArcxnth5pzzgbEtuHSQ");
        await fs.writeFile(path.join(keyringPath, `node0.info`), "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMi0wOC0yNCAxODowOTowNC43NTg1NjYgKzA4MDAgQ1NUIG09KzAuMjIyMjM0MDQzIiwiZW5jIjoiQTI1NkdDTSIsInAyYyI6ODE5MiwicDJzIjoicmk3MzV2Y3Fid2VkUF9JcCJ9.ht-BieDMdmkOBfb1saBx2nvBDaD9anNxP5RTirHIk-tHUXJr6HbeKA.FvpzGpaY6il86ngO.WwHd6HTneYvxg3KkEhsXx1_F_XkmzHqVJwSmQrnX9ZSg2L8ZCAxV6rvliuRwt30816o8tElb06qpp1krFGwGL_LvP1FtnOiX4GdJJxAyX1lgBgJQrhZuqKc6EEE78ArwUR1Mb6b3ax_6oV7IB42izg1ci2PP5bgXN-510EM9RrSi9fnVl3UMoAanoBL8NfJGYHo2Cusn_Y14yEnPDHxS96vTl7wZx_pZrjtapyQ9ktnDQHVBfsupIKmIYXSwpQ16FQ9G4eclfKGhit4uUFofdT0UMG1g_aQEGHt1nPG08w66w8PxmW8ma_D8yCQp0TW6m9pTLWODiCztorLucEr9RFW9mJLofi4pFdCuqHrGm_o.X06PXwtrfTMDgiQDIpPS0g");
      }
    }

    await fs.copy(evmosd, `./nodes/${evmosd}`);
    if (ibc) {
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
      curKeySeed.bip39Address = ethToEvmos(wallet.address);
      await fs.outputJson(keySeedPath, curKeySeed, { spaces: 2 });
    }

    const account = { "@type": "/ethermint.types.v1.EthAccount", base_account: { address: "", pub_key: null, account_number: "0", sequence: "0" }, code_hash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470" };
    const balance = { address: "", coins: [{ denom: govCoin ? "agov" : "aevmos", amount: "0" }] };
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
      //   denom: "aevmos",
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
        if (govCoin) {
          balances.coins.unshift({
            denom: "aevmos",
            amount: "0",
          });
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
      data = data.replace(`minimum-gas-prices = "0aevmos"`, `minimum-gas-prices = "${config.minimumGasPrices}"`);
      config.pruning && (data = data.replace(`pruning = "default"`, `pruning = "${config.pruning}"`));
      await fs.writeFile(appConfigPath, data);

      const configPath = path.join(nodesDir, `node${i}/evmosd/config/config.toml`);
      const rpcServerPort = config.rpcServerPort || 26657;
      const p2pPort = config.p2pPort || 10000;
      const pprofPort = config.pprofPort || 6060;
      data = await fs.readFile(configPath, "utf8");
      data = data.replace("0.0.0.0:26657", `0.0.0.0:${rpcServerPort + i}`);
      data = data.replaceAll("cors_allowed_origins = []", `cors_allowed_origins = ["*"]`);
      data = data.replaceAll("allow_duplicate_ip = false", `allow_duplicate_ip = true`);
      // data = data.replaceAll("prometheus = false", `prometheus = true`);
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

    if (ibc) {
      await fs.ensureFile(path.join(rlyHome, "config/config.yaml"));
      await fs.writeFile(path.join(rlyHome, "config/config.yaml"), rlyCft);

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
      let p2pPort = config.p2pPort + i;
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

    if (ibc) {
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
    if (ibc) {
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
