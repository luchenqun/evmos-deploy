import { ethToBech32 } from "../utils.js";
import path from "path";
import Web3 from "web3";
import { decodeReply, execPromis, sleep } from "../utils.js";
import MyToken from "./v2-core/MyToken.json" assert { type: "json" };

const endpoint = "http://127.0.0.1:8545";
const hexPrivateKey = "0xe54bff83fc945cba77ca3e45d69adc5b57ad8db6073736c8422692abecfb5fe2";

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
    let matic = new web3.eth.Contract(MyToken.abi);
    await deploy(matic, MyToken.bytecode, ["Matic Token For Test", "MATIC", 18, web3.utils.toWei("100")]);
    console.log("ERC20 Address", matic.address);

    // you should use cmd `node init.js --v=1 --s=true` to run 1 nodes
    const cwd = path.join(process.cwd(), "..");
    const fixed = `--from=node0 --home=./nodes/node0/evmosd/ --keyring-backend=test --chain-id=quarix_88888888-1 --gas="auto" -y`;
    const erc20Address = matic.address;
    const evmAddress = ethToBech32(from, prefix);
    let cmd;
    let reply;

    {
      cmd = `./evmosd tx gov submit-legacy-proposal register-erc20 ${erc20Address} --title="Test register erc20" --description="Register erc20 MANTIC" --deposit="10000000akgov" ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));

      await sleep(3000);

      cmd = `./evmosd tx gov vote 1 yes ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    {
      // erc20 tokon => native coin
      await sleep(7000); // must sleep voting_period time
      cmd = `./evmosd tx erc20 convert-erc20 ${erc20Address} ${web3.utils.toWei("10")} ${evmAddress} ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    {
      // native coin => erc20 tokon
      await sleep(3000);
      cmd = `./evmosd tx erc20 convert-coin ${web3.utils.toWei("2")}erc20/${erc20Address} ${from} ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
