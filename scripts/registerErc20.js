import { ethToBech32 } from "../utils.js";
import path from "path";
import Web3 from "web3";
import { decodeReply, execPromis, sleep } from "../utils.js";
import MyToken from "./v2-core/MyToken.json" assert { type: "json" };

const endpoint = "http://127.0.0.1:8545";
const hexPrivateKey = "0xf78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769"; // 0x00000Be6819f41400225702D32d3dd23663Dd690

let run = async function () {
  try {
    const web3 = new Web3(new Web3.providers.HttpProvider(endpoint, { timeout: 1000 * 30 }));
    const account = web3.eth.accounts.privateKeyToAccount(hexPrivateKey);
    const from = account.address;

    const chainId = await web3.eth.getChainId();
    const gasPrice = await web3.eth.getGasPrice();
    const gas = 5000000;
    const prefix = "quarix";

    async function sendTransaction(data, to, value) {
      let nonce = await web3.eth.getTransactionCount(from);
      data = data.startsWith("0x") ? data : "0x" + data;
      const message = { from, gas, gasPrice, data, nonce, chainId };
      if (to) {
        message.to = to;
      }
      if (value) {
        message.value = value;
      }
      const transaction = await account.signTransaction(message);
      return web3.eth.sendSignedTransaction(transaction.rawTransaction);
    }

    async function deploy(contract, bytecode, args) {
      let data = contract.deploy({ data: bytecode, arguments: args || [] }).encodeABI();
      let receipt = await sendTransaction(data);
      contract.options.address = receipt.contractAddress;
      contract.address = receipt.contractAddress;
    }

    // deploy Matic Token contract
    let thbs = new web3.eth.Contract(MyToken.abi);
    await deploy(thbs, MyToken.bytecode, ["THB Stable", "THBS", 18, "10000"]);
    console.log("ERC20 Address", thbs.address);

    // you should use cmd `node init.js --v=1 --s=true` to run 1 nodes
    const cwd = path.join(process.cwd(), "..");
    const fixed = `--from=qoe --home=./nodes/node0/quarixd/ --keyring-backend=test --chain-id=quarix_8888888-1 --gas="auto" -y`;
    const erc20Address = thbs.address;
    const evmAddress = ethToBech32(from, prefix);
    let cmd;
    let reply;

    {
      cmd = `./quarixd tx gov submit-legacy-proposal register-erc20 ${erc20Address} --title="register erc20 token thbs" --description="register erc20 token thbs to native token" --deposit="10000000aqrx" ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(1500);
    }

    {
      cmd = `./quarixd tx gov vote 1 yes ${fixed.replace("qoe", "node0")}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(9000); // must sleep voting_period time
    }

    {
      // erc20 tokon => native coin
      cmd = `./quarixd tx erc20 convert-erc20 ${erc20Address} ${web3.utils.toWei("10")} ${evmAddress} ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(1500);
    }

    {
      // native coin => erc20 tokon
      cmd = `./quarixd tx erc20 convert-coin ${web3.utils.toWei("2")}erc20/${erc20Address} ${from} ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
      await sleep(1500);
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
