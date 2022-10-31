import Web3 from "web3";
import Multicall from "./v2-core/Multicall.json" assert { type: "json" };
import MyToken from "./v2-core/MyToken.json" assert { type: "json" };
import UniswapV2Factory from "./v2-core/UniswapV2Factory.json" assert { type: "json" };
import UniswapV2Pair from "./v2-core/UniswapV2Pair.json" assert { type: "json" };
import UniswapV2Router01 from "./v2-periphery/UniswapV2Router01.json" assert { type: "json" };
import UniswapV2Router02 from "./v2-periphery/UniswapV2Router02.json" assert { type: "json" };
import WETH9 from "./v2-periphery/WETH9.json" assert { type: "json" };
import fs from "fs-extra";

let endpoint, hexPrivateKey;
endpoint = "http://carina-eth-rpc.mybc.fun";
hexPrivateKey = "0xf78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769";

endpoint = "http://127.0.0.1:8545";
hexPrivateKey = "0xf78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769";

class UniSwap {
  constructor({ url, privateKey, gas, weth, factory, router01, router02, multicall, matic, usdt }) {
    this.web3 = new Web3(new Web3.providers.HttpProvider(url, { timeout: 1000 * 30 }));
    this.privateKey = privateKey;
    this.account = web3.eth.accounts.privateKeyToAccount(hexPrivateKey);
    this.from = this.account.address;
    this.gas = gas || 5000000;
    this.chainId = undefined;
    this.gasPrice = undefined;

    // 合约配置
    this.weth = new this.web3.eth.Contract(WETH9.abi, weth);
    this.factory = new this.web3.eth.Contract(UniswapV2Factory.abi, factory);
    this.router01 = new this.web3.eth.Contract(UniswapV2Router01.abi, router01);
    this.router02 = new this.web3.eth.Contract(UniswapV2Router02.abi, router02);
    this.multicall = new this.web3.eth.Contract(Multicall.abi, multicall);
    this.matic = new this.web3.eth.Contract(MyToken.abi, matic);
    this.usdt = new this.web3.eth.Contract(MyToken.abi, usdt);
  }
  async sendTransaction(data, to, value) {
    let { web3, from, account, chainId, gas, gasPrice } = this;
    if (!this.chainId) {
      this.chainId = await this.web3.eth.getChainId();
      chainId = this.chainId;
    }
    if (!this.gasPrice) {
      this.gasPrice = await this.web3.eth.getGasPrice();
      gasPrice = this.gasPrice;
    }
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
  async deploy(contract, bytecode, args) {
    if (contract._address) {
      contract.options.address = contract._address;
      contract.address = contract._address;
    } else {
      let data = contract.deploy({ data: bytecode, arguments: args || [] }).encodeABI();
      let receipt = await this.sendTransaction(data);
      contract.options.address = receipt.contractAddress;
      contract.address = receipt.contractAddress;
    }
    return contract.address;
  }
  async send(contract, method, args, value) {
    const data = contract.methods[method].apply(contract.methods, args || []).encodeABI();
    await this.sendTransaction(data, contract.options.address, value);
  }
  async call(contract, method, from, inputArr) {
    if (!Array.isArray(inputArr)) {
      inputArr = [];
    }
    let func = contract.methods[method].apply(contract.methods, inputArr);
    let options = from ? { from } : {};
    options.gas = 5000000;
    options.gasPrice = 1000000000;
    return await func.call(options);
  }
  async deployContract() {
    let ret = {};

    let data = UniswapV2Pair.bytecode;
    if (!data.startsWith("0x")) data = "0x" + data;
    const hash = web3.utils.keccak256(data);
    console.info("INIT_CODE_HASH:", hash);
    if (hash != "0xd2c96a9e01a194a1b1ea751757305327f2b69850cd83b135d7868817bb70590c") {
      console.warn("计算出来的init code hash为 " + hash + " ，与系统默认的不一致，请确保你已经更新合约v2-periphery/contracts/libraries/UniswapV2Library.sol里面的init code hash并重新编译过合约了。");
      return ret;
    }

    ret.weth = await this.deploy(this.weth, WETH9.bytecode, []);
    ret.factory = await this.deploy(this.factory, UniswapV2Factory.bytecode, [this.from]);
    ret.router01 = await this.deploy(this.router01, UniswapV2Router01.bytecode, [this.factory.address, this.weth.address]);
    ret.router02 = await this.deploy(this.router02, UniswapV2Router02.bytecode, [this.factory.address, this.weth.address]);
    ret.multicall = await this.deploy(this.multicall, Multicall.bytecode, []);
    ret.matic = await this.deploy(this.matic, MyToken.bytecode, ["Matic Token", "MATIC", 18, web3.utils.toWei("100000000")]);
    ret.usdt = await this.deploy(this.usdt, MyToken.bytecode, ["Tether USD", "USDT", 18, web3.utils.toWei("100000000")]);
    return ret;
  }
  async approveToRouter() {
    const APPROVE_AMOUNT = web3.utils.toWei("100000000");
    const { from, router02, web3, send, call } = this;
    const approve = async (contract) => {
      let amount = parseFloat(web3.utils.fromWei(await call(contract, "allowance", [from, router02.address])));
      if (amount < 10000000) {
        await send(contract, "approve", [router02.address, APPROVE_AMOUNT]);
      }
    };
    await approve(this.weth);
    await approve(this.matic);
    await approve(this.usdt);
  }
  async deposit(amount) {
    const { from, weth, web3, send, call } = this;
    let curAmout = parseFloat(web3.utils.fromWei(await call(weth, "balanceOf", from, [from])));
    if (parseFloat(amount) < curAmout) {
      await send(weth, "deposit", [], web3.utils.toWei(String(parseFloat(amount) - curAmout)));
    }
  }
  async transfer(token, to, amount) {
    const { web3, send } = this;
    await send(token, "transfer", [to, web3.utils.toWei(amount)]);
  }
  async addLiquidity(token1, token2, amount1, amount2) {
    await this.approveToRouter();
    const params = [token1.address, token2.address, web3.utils.toWei(amount1), web3.utils.toWei(amount2), 1, 1, this.from, parseInt(new Date().getTime() / 1000) + 600];
    await this.send(this.router02, "addLiquidity", params);
  }
}

(async () => {
  return;
  const web3 = new Web3(new Web3.providers.HttpProvider(endpoint, { timeout: 1000 * 30 }));
  const account = web3.eth.accounts.privateKeyToAccount(hexPrivateKey);
  const from = account.address;

  const chainId = await web3.eth.getChainId();
  const gasPrice = await web3.eth.getGasPrice();
  const gas = 5000000;
  const APPROVE_AMOUNT = web3.utils.toWei("1000000000000000000000000000000000000000000");
  const to = "0x1111102Dd32160B064F2A512CDEf74bFdB6a9F96";

  let uniswap = { deployPrivateKey: hexPrivateKey };

  // calc code hash
  {
    let data = UniswapV2Pair.bytecode;
    if (!data.startsWith("0x")) data = "0x" + data;
    const hash = web3.utils.keccak256(data);
    console.info("INIT_CODE_HASH:", hash);
    if (hash != "0xd2c96a9e01a194a1b1ea751757305327f2b69850cd83b135d7868817bb70590c") {
      console.warn("计算出来的init code hash为 " + hash + " ，与系统默认的不一致，请确保你已经更新合约v2-periphery/contracts/libraries/UniswapV2Library.sol里面的init code hash并重新编译过合约了。");
    }
  }

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

  async function send(contract, method, args, value) {
    const data = contract.methods[method].apply(contract.methods, args || []).encodeABI();
    await sendTransaction(data, contract.options.address, value);
  }

  async function call(contract, method, from, inputArr) {
    if (!Array.isArray(inputArr)) {
      inputArr = [];
    }
    let func = contract.methods[method].apply(contract.methods, inputArr);
    let options = from ? { from } : {};
    options.gas = 5000000;
    options.gasPrice = 1000000000;
    return await func.call(options);
  }

  // deploy WETH contract
  let weth = new web3.eth.Contract(WETH9.abi);
  await deploy(weth, WETH9.bytecode, []);
  console.info("WETH:", weth.address);
  uniswap.weth = weth.address;

  // deploy UniswapV2Factory contract
  let factory = new web3.eth.Contract(UniswapV2Factory.abi);
  await deploy(factory, UniswapV2Factory.bytecode, [from]);
  console.info("UniswapV2Factory:", factory.address);
  uniswap.factory = factory.address;

  // deploy UniswapV2Router01 contract
  let router01 = new web3.eth.Contract(UniswapV2Router01.abi);
  await deploy(router01, UniswapV2Router01.bytecode, [factory.address, weth.address]);
  console.info("UniswapV2Router01:", router01.address);

  // deploy UniswapV2Router02 contract
  let router02 = new web3.eth.Contract(UniswapV2Router02.abi);
  await deploy(router02, UniswapV2Router02.bytecode, [factory.address, weth.address]);
  console.info("UniswapV2Router02:", router02.address);
  uniswap.router02 = router02.address;

  // deploy Multicall contract
  let multicall = new web3.eth.Contract(Multicall.abi);
  await deploy(multicall, Multicall.bytecode, []);
  console.info("Multicall:", multicall.address);

  // deploy Matic Token contract
  let matic = new web3.eth.Contract(MyToken.abi);
  await deploy(matic, MyToken.bytecode, ["Matic Token", "MATIC", 18, web3.utils.toWei("100000000")]);
  console.info("MyToken MATIC:", matic.address);
  uniswap.matic = matic.address;

  // deploy USDT Token contract
  let usdt = new web3.eth.Contract(MyToken.abi);
  await deploy(usdt, MyToken.bytecode, ["Tether USD", "USDT", 18, web3.utils.toWei("100000000")]);
  console.info("MyToken USDT:", usdt.address);
  uniswap.usdt = usdt.address;

  console.log("deposit ETH to WETH contract");
  await send(weth, "deposit", [], web3.utils.toWei("5"));

  console.log("weth approve router02");
  await send(weth, "approve", [router02.address, APPROVE_AMOUNT]);

  console.log("matic approve router02");
  await send(matic, "approve", [router02.address, APPROVE_AMOUNT]);

  console.log("usdt approve router02");
  await send(usdt, "approve", [router02.address, APPROVE_AMOUNT]);

  console.log("addLiquidity weth <--> matic (1:1333) ");
  await send(router02, "addLiquidity", [weth.address, matic.address, web3.utils.toWei("1"), web3.utils.toWei("1333"), 1, 1, from, parseInt(new Date().getTime() / 1000) + 600]); // 10分钟内要成交, neloMata用得是ms, ethereum 用得是s

  console.log("addLiquidity weth <--> usdt (1:4000)");
  await send(router02, "addLiquidity", [weth.address, usdt.address, web3.utils.toWei("1"), web3.utils.toWei("4000"), 1, 1, from, parseInt(new Date().getTime() / 1000) + 600]);

  console.log(`before swapExactTokensForTokens ${from} have weth:`, web3.utils.fromWei(await call(weth, "balanceOf", from, [from])));
  console.log(`before swapExactTokensForTokens ${to} have matic:`, web3.utils.fromWei(await call(weth, "balanceOf", to, [to])));

  console.log("swapExactTokensForTokens");
  await send(router02, "swapExactTokensForTokens", [web3.utils.toWei("0.01"), "1", [weth.address, matic.address], to, parseInt(new Date().getTime() / 1000) + 600]);

  console.log(`after swapExactTokensForTokens ${from} have weth:`, web3.utils.fromWei(await call(weth, "balanceOf", from, [from])));
  console.log(`after swapExactTokensForTokens ${to} have matic:`, web3.utils.fromWei(await call(matic, "balanceOf", to, [to])));

  await fs.outputJSON("./uniswap.json", uniswap, { spaces: 2 });
})();
