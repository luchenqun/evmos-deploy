import { Wallet } from "@ethersproject/wallet";
import { ethToCosmos } from "@tharsis/address-converter";
import { exec } from "child_process";
import fs from "fs-extra";
import path from "path";
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
const execPromis = util.promisify(exec);
const curDir = process.cwd();
const nodesDir = path.join(curDir, "nodes");
const app = platform == "win32" ? "simd.exe" : "simd";
const scriptStop = path.join(nodesDir, platform == "win32" ? "stopAll.vbs" : "stopAll.sh");
const scriptStart = path.join(nodesDir, platform == "win32" ? "startAll.vbs" : "startAll.sh");
const tenderKeys = new TenderKeys();
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
    const { preMinePerAccount } = config;
    const nodeKey = { priv_key: { type: "tendermint/PrivKeyEd25519", value: "i652NGR7/1jxYo1WDrFRjEkfVpgx5Gxnw/aznn5fqm1xkCwDJKSrWYqCaQBi85IvI1j2hBH6l/Fp7cuuLvPNjg==" } };
    const privValidatorKey = { address: "83BA09EABD77EA3357DFD3CC28EEF85E4212B902", pub_key: { type: "tendermint/PubKeyEd25519", value: "yl7P8BSjYFxIC2R8OKcY5vtMNAC4EMciwkmEaCIw/ZI=" }, priv_key: { type: "tendermint/PrivKeyEd25519", value: "lKxM9NE4GzQO83Jli84MvBndp9oecGmDFBGkmTIQbXXKXs/wFKNgXEgLZHw4pxjm+0w0ALgQxyLCSYRoIjD9kg==" } };
    const createValidator = { body: { messages: [{ "@type": "/cosmos.staking.v1beta1.MsgCreateValidator", description: { moniker: "node0", identity: "", website: "", security_contact: "", details: "" }, commission: { rate: "0.100000000000000000", max_rate: "1.000000000000000000", max_change_rate: "1.000000000000000000" }, min_self_delegation: "1", delegator_address: "cosmos12ltvts09ga3gj32hsmnwq922ze0gmk4tgw4uxg", validator_address: "cosmosvaloper12ltvts09ga3gj32hsmnwq922ze0gmk4td6pf2m", pubkey: { "@type": "/cosmos.crypto.ed25519.PubKey", key: "yl7P8BSjYFxIC2R8OKcY5vtMNAC4EMciwkmEaCIw/ZI=" }, value: { denom: "stake", amount: "100000000" } }], memo: "5220fb21a28a13f5d40722611c53e7737cb6ba4d@192.168.0.1:26656", timeout_height: "0", extension_options: [], non_critical_extension_options: [] }, auth_info: { signer_infos: [{ public_key: { "@type": "/cosmos.crypto.secp256k1.PubKey", key: "Ay0k04G0uccWGhKZUwljVabkSOwYNqxwFkerBrPbmPsr" }, mode_info: { single: { mode: "SIGN_MODE_DIRECT" } }, sequence: "0" }], fee: { amount: [], gas_limit: "0", payer: "", granter: "" } }, signatures: ["KTV5RObbWUOOVg2ViDgHwGcV3yRj34PUWVYpHmsEVxAhDWbHfjYs5636dDHwjf46lI7aXov29fjIdWH4mH5Fiw=="] };
    const keySeed = { secret: "october pride genuine harvest reunion sight become tuna kingdom punch girl lizard cat crater fee emotion seat test output safe volume caught design soft", privateKey: "e54bff83fc945cba77ca3e45d69adc5b57ad8db6073736c8422692abecfb5fe2", publicKey: "049d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c1adb92ef31b067e67e77dc77061f76bb52fe4dfa85667f27657610a77429a09b", compressedPublicKey: "039d2b6c98374cc3c009bcc4e548e0d1c971f9de2e74102d820a8442207bbfd49c", address: "0x57D6C5C1e5476289455786E6E0154a165E8ddaaB", bip39Address: "cosmos12ltvts09ga3gj32hsmnwq922ze0gmk4tgw4uxg" };
    if (await fs.pathExists(scriptStop)) {
      console.log("Try to stop the simd under the nodes directory");
      await execPromis(scriptStop, { cwd: nodesDir }); // Anyway, stop it first
      await sleep(platform == "win32" ? 600 : 300);
    }
    if (!fs.existsSync(app) || isCompile) {
      console.log("Start recompiling simd...");
      let make = await execPromis("go build ../simapp/simd", { cwd: curDir });
      console.log("simd compile finished", make);
    }

    if (!fs.existsSync(app)) {
      console.log("simd Executable file does not exist");
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
      const initFiles = `${platform !== "win32" ? "./" : ""}${app} testnet --v ${nodesCount} --output-dir ./nodes --chain-id evmos_20191205-1 --keyring-backend test`;
      const initFilesValidator = `${platform !== "win32" ? "./" : ""}${app} testnet --v ${validators} --output-dir ./nodes --chain-id evmos_20191205-1 --keyring-backend test`;
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
        const genesisPath = path.join(nodesDir, `node0/simd/config/genesis.json`);
        for (let i = validators; i < nodesCount; i++) {
          await fs.copy(genesisPath, path.join(nodesDir, `node${i}/simd/config/genesis.json`));
        }
      }

      await fs.writeJSON(path.join(nodesDir, `node0/simd/config/node_key.json`), nodeKey);
      await fs.writeJSON(path.join(nodesDir, `node0/simd/config/priv_validator_key.json`), privValidatorKey);
      await fs.outputJSON(path.join(nodesDir, `node0/simd/key_seed.json`), keySeed);
      const keyringPath = path.join(nodesDir, `node0/simd/keyring-test`);
      await fs.emptyDir(keyringPath);
      await fs.writeFile(path.join(keyringPath, `57d6c5c1e5476289455786e6e0154a165e8ddaab.address`), "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMi0wOS0xMCAyMzo0OTowOS45Njc2Mjg3ICswODAwIENTVCBtPSswLjA5OTcxOTgwMSIsImVuYyI6IkEyNTZHQ00iLCJwMmMiOjgxOTIsInAycyI6ImxCWWVyMEhTWFc3ZmtpT1EifQ.WWTZoA0Kvd9LQC4wMqE_R2MmlItRin01wAKDWvaX5HYAfzASRzkesw.zhcHjVunAQSHiRfq.A9cGTMljuXiBswiVJjB1SiCvvai4FrB0VPEIj3VzE2MiUbAJvriYnUP1hgbLFKDCQ49_oMpbMvG3Nm0WFp-xgsyK7JDVxc6cMqLyEhd0sqNAQZrVLj91301akmyDlKr2F5slh9OIJBQjCp08Pj1nBcxhJqHEzaB4HHUwv1PyKGTC-rI22emhmeRcLh0dzRRDRe8klcTbYKl1kRg-YYJjXmibJ6aJ2qGgeydnXNDwSaTQP9uhdn0.caIRzfJK5NyuliAESVNV5w");
      await fs.writeFile(path.join(keyringPath, `node0.info`), "eyJhbGciOiJQQkVTMi1IUzI1NitBMTI4S1ciLCJjcmVhdGVkIjoiMjAyMi0wOS0xMCAyMzo0OTowOS45NjE1MDcxICswODAwIENTVCBtPSswLjA5MzU5ODIwMSIsImVuYyI6IkEyNTZHQ00iLCJwMmMiOjgxOTIsInAycyI6IjEzTEdSWFprZVFiNWRrVkoifQ.L9_qkFSEQb-rciobi6YcLIF_kjFqXhbGxTFj7nZZjaHBFOkbgGiIKw.j6S3Fd3TAL0UrPuw.gMlCmxqvs8kzPcIG-Y87CKTWOCmMCmnkbShOuknC-a713zb4z90-Y-Se7Ki-8QTLUyOZe0ksVwFZBzEivVJRQ1gNRWQ8dFnhGHMVtC1IRt87xnu8dn5RHautYuwAdmwpZzduDeQJGyTx8xNl0ZPnJ-qjoLcgUTV7KNQG-orpnPH7LnGTfTHKl4W3mAMSD-XrSIz3ZzNElTAUHEMs6JXsHgKi3o1YR7H2e3dzQpWXqNFKPZb14PWaAvMrYvCoTJ6D0gaaPX-YqAmWwYcqA42rWfbIpZtukVbcG16GfNvo6CYJoN-ZfndKcsm8rvA2l51xEUneQTCVP6UGcOJ2fmIxKsa-Vks1uuZY.plLvTYQTdZr8fJZtg4zm2Q");
    }

    await fs.copy(app, `./nodes/${app}`);

    let nodeIds = [];
    for (let i = 0; i < nodesCount; i++) {
      const nodeKey = await fs.readJSON(path.join(nodesDir, `node${i}/simd/config/node_key.json`));
      const nodeId = tenderKeys.getBurrowAddressFromPrivKey(Buffer.from(nodeKey.priv_key.value, "base64").toString("hex"));
      nodeIds.push(nodeId);

      const keySeedPath = path.join(nodesDir, `node${i}/simd/key_seed.json`);
      let curKeySeed = await fs.readJSON(keySeedPath);
      const wallet = Wallet.fromMnemonic(curKeySeed.secret);
      curKeySeed.privateKey = wallet._signingKey().privateKey.toLowerCase().replace("0x", "");
      curKeySeed.publicKey = wallet._signingKey().publicKey.toLowerCase().replace("0x", "");
      curKeySeed.compressedPublicKey = wallet._signingKey().compressedPublicKey.toLowerCase().replace("0x", "");
      curKeySeed.address = wallet.address;
      curKeySeed.bip39Address = ethToCosmos(wallet.address);
      await fs.outputJson(keySeedPath, curKeySeed, { spaces: 2 });
    }

    for (let i = 0; i < nodesCount; i++) {
      const address = "cosmos1qqqqhe5pnaq5qq39wqkn957aydnrm45s0jk6ae"; // 0x00000be6819f41400225702d32d3dd23663dd690
      const account = {
        "@type": "/cosmos.auth.v1beta1.BaseAccount",
        address,
        pub_key: null,
        account_number: "0",
        sequence: "0",
      };
      const balance = {
        address,
        coins: [
          {
            denom: "stake",
            amount: "0",
          },
          {
            denom: "testtoken",
            amount: "0",
          },
        ],
      };

      const genesisPath = path.join(nodesDir, `node${i}/simd/config/genesis.json`);
      let genesis = await fs.readJSON(genesisPath);
      let appState = genesis.app_state;
      appState.auth.accounts.push(account);
      appState.bank.balances.push(balance);
      if (commonNode > 0) {
        for (let i = nodesCount - commonNode; i < nodesCount; i++) {
          const keySeedPath = path.join(nodesDir, `node${i}/simd/key_seed.json`);
          let curKeySeed = await fs.readJSON(keySeedPath);
          let curAccount = JSON.parse(JSON.stringify(account));
          let curBalance = JSON.parse(JSON.stringify(balance));
          curAccount.address = curKeySeed.bip39Address;
          curBalance.address = curKeySeed.bip39Address;
          appState.auth.accounts.push(curAccount);
          appState.bank.balances.push(curBalance);
        }
      }
      delete genesis.app_state.bank.supply;

      for (let balances of appState.bank.balances) {
        for (let coin of balances.coins) {
          coin.amount = preMinePerAccount;
        }
      }

      appState.auth.accounts[0].address = keySeed.bip39Address;
      appState.bank.balances[0].address = keySeed.bip39Address;
      appState.genutil.gen_txs[0] = createValidator;

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
      const appConfigPath = path.join(nodesDir, `node${i}/simd/config/app.toml`);
      const swaggerPort = config.swaggerPort || 1317;
      const rosettaPort = config.rosettaPort || 8080;
      const grpcPort = config.grpcPort || 9090;
      const grpcWebPort = config.grpcWebPort || 9091;
      data = await fs.readFile(appConfigPath, "utf8");
      data = data.replace("tcp://0.0.0.0:1317", `tcp://0.0.0.0:${swaggerPort + i}`);
      data = data.replace("swagger = false", `swagger = true`);
      data = data.replaceAll("enabled-unsafe-cors = false", `enabled-unsafe-cors = true`);
      // data = data.replaceAll("enable = false", `enable = true`) // on rosetta enable is false, and we need is false
      data = data.replace(":8080", `:${rosettaPort + i}`);
      data = data.replace("0.0.0.0:9090", `0.0.0.0:${grpcPort - i}`);
      data = data.replace("0.0.0.0:9091", `0.0.0.0:${grpcWebPort + i}`);
      data = data.replace(`minimum-gas-prices = "0stake"`, `minimum-gas-prices = "${config.minimumGasPrices}"`);
      await fs.writeFile(appConfigPath, data);

      const configPath = path.join(nodesDir, `node${i}/simd/config/config.toml`);
      const rpcServerPort = config.rpcServerPort || 26657;
      const p2pPort = config.p2pPort || 10000;
      const pprofPort = config.pprofPort || 6060;
      data = await fs.readFile(configPath, "utf8");
      data = data.replace("0.0.0.0:26657", `0.0.0.0:${rpcServerPort + i}`);
      data = data.replaceAll("cors_allowed_origins = []", `cors_allowed_origins = ["*"]`);
      data = data.replaceAll("allow_duplicate_ip = false", `allow_duplicate_ip = true`);
      data = data.replace("tcp://0.0.0.0:26656", `tcp://0.0.0.0:${p2pPort + i}`);
      data = data.replace("localhost:6060", `localhost:${pprofPort + i}`);

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
      let start = (platform == "win32" ? "" : "#!/bin/bash\n") + (isNohup && platform !== "win32" ? "nohup " : "") + (platform !== "win32" ? "./" : "") + `${app} start --home ./node${i}/simd/` + (isNohup && platform !== "win32" ? ` >./evmos${i}.log 2>&1 &` : "");
      let stop =
        platform == "win32"
          ? `@echo off
for /f "tokens=5" %%i in ('netstat -ano ^| findstr 0.0.0.0:${p2pPort}') do set PID=%%i
taskkill /F /PID %PID%`
          : platform == "linux"
          ? `pid=\`netstat -anp | grep :::${p2pPort} | awk '{printf $7}' | cut -d/ -f1\`;
    kill -15 $pid`
          : `pid=\`lsof -i :${p2pPort} | grep simd | grep LISTEN | awk '{printf $2}'|cut -d/ -f1\`;
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
      console.log("Start all simd node under the folder nodes");
      await execPromis(scriptStart, { cwd: nodesDir }); // 不管怎样先执行一下停止
    }
  } catch (error) {
    console.log("error", error);
  }
};

init();
