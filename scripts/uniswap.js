import Web3 from "web3";
import { readFile } from "fs/promises";
const Multicall = JSON.parse(await readFile(new URL("./v2-core/Multicall.json", import.meta.url)));
const MyToken = JSON.parse(await readFile(new URL("./v2-core/MyToken.json", import.meta.url)));
const UniswapV2Factory = JSON.parse(await readFile(new URL("./v2-core/UniswapV2Factory.json", import.meta.url)));
const UniswapV2Pair = JSON.parse(await readFile(new URL("./v2-core/UniswapV2Pair.json", import.meta.url)));
const UniswapV2Router01 = JSON.parse(await readFile(new URL("./v2-periphery/UniswapV2Router01.json", import.meta.url)));
const UniswapV2Router02 = JSON.parse(await readFile(new URL("./v2-periphery/UniswapV2Router02.json", import.meta.url)));
const WETH9 = JSON.parse(await readFile(new URL("./v2-periphery/WETH9.json", import.meta.url)));

export default class Uniswap {
  constructor({ url, privateKey, gas, weth, factory, router01, router02, multicall, matic, usdt }) {
    this.web3 = new Web3(new Web3.providers.HttpProvider(url, { timeout: 1000 * 30 }));
    this.privateKey = privateKey;
    this.account = this.web3.eth.accounts.privateKeyToAccount(privateKey);
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

    this.weth.address = weth;
    this.factory.address = factory;
    this.router01.address = router01;
    this.router02.address = router02;
    this.multicall.address = multicall;
    this.matic.address = matic;
    this.usdt.address = usdt;
  }
  updatePrivateKey(privateKey) {
    this.privateKey = privateKey;
    this.account = this.web3.eth.accounts.privateKeyToAccount(privateKey);
    this.from = this.account.address;
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
    const hash = this.web3.utils.keccak256(data);
    console.info("INIT_CODE_HASH:", hash);
    if (hash != "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f") {
      console.warn("计算出来的init code hash为 " + hash + " ，与系统默认的不一致，请确保你已经更新合约v2-periphery/contracts/libraries/UniswapV2Library.sol里面的init code hash并重新编译过合约了。");
      return ret;
    }
    console.log("=========================uniswap deploying, please wait.... =========================");
    ret.weth = await this.deploy(this.weth, WETH9.bytecode, []);
    console.log("weth address: ", ret.weth);
    ret.factory = await this.deploy(this.factory, UniswapV2Factory.bytecode, [this.from]);
    console.log("factory address: ", ret.factory);
    ret.router01 = await this.deploy(this.router01, UniswapV2Router01.bytecode, [this.factory.address, this.weth.address]);
    console.log("router01 address: ", ret.router01);
    ret.router02 = await this.deploy(this.router02, UniswapV2Router02.bytecode, [this.factory.address, this.weth.address]);
    console.log("router02 address: ", ret.router02);
    ret.multicall = await this.deploy(this.multicall, Multicall.bytecode, []);
    console.log("multicall address: ", ret.multicall);
    ret.matic = await this.deploy(this.matic, MyToken.bytecode, ["Matic Token", "MATIC", 18, this.web3.utils.toWei("10000000000")]);
    console.log("matic address: ", ret.matic);
    ret.usdt = await this.deploy(this.usdt, MyToken.bytecode, ["Tether USD", "USDT", 18, this.web3.utils.toWei("10000000000")]);
    console.log("usdt address: ", ret.usdt);
    console.log("=================================UNISWAP DEPLOY INFO=================================");
    console.log(JSON.stringify(ret, undefined, 2));
    console.log("=================================UNISWAP DEPLOY INFO=================================");
    return ret;
  }
  async deployCheckContract() {
    let ret = {};
    const deployed = async (contract) => {
      if (contract._address) {
        let code = await this.web3.eth.getCode(contract._address, "latest");
        return code.length > 2;
      } else {
        return false;
      }
    };

    let data = UniswapV2Pair.bytecode;
    if (!data.startsWith("0x")) data = "0x" + data;
    const hash = this.web3.utils.keccak256(data);
    console.info("INIT_CODE_HASH:", hash);
    if (hash != "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f") {
      console.warn("计算出来的init code hash为 " + hash + " ，与系统默认的不一致，请确保你已经更新合约v2-periphery/contracts/libraries/UniswapV2Library.sol里面的init code hash并重新编译过合约了。");
      return ret;
    }
    console.log("=========================uniswap deploying, please wait.... =========================");
    if (!(await deployed(this.weth))) {
      delete this.weth._address;
      await this.deploy(this.weth, WETH9.bytecode, []);
    }
    ret.weth = this.weth._address;
    console.log("weth address: ", ret.weth);

    if (!(await deployed(this.factory))) {
      delete this.factory._address;
      await this.deploy(this.factory, UniswapV2Factory.bytecode, [this.from]);
    }
    ret.factory = this.factory._address;
    console.log("factory address: ", ret.factory);

    if (!(await deployed(this.router01))) {
      delete this.router01._address;
      await this.deploy(this.router01, UniswapV2Router01.bytecode, [this.factory.address, this.weth.address]);
    }
    ret.router01 = this.router01._address;
    console.log("router01 address: ", ret.router01);

    if (!(await deployed(this.router02))) {
      delete this.router02._address;
      await this.deploy(this.router02, UniswapV2Router02.bytecode, [this.factory.address, this.weth.address]);
    }
    ret.router02 = this.router02._address;
    console.log("router02 address: ", ret.router02);

    if (!(await deployed(this.multicall))) {
      delete this.multicall._address;
      await this.deploy(this.multicall, Multicall.bytecode, []);
    }
    ret.multicall = this.multicall._address;
    console.log("multicall address: ", ret.multicall);

    if (!(await deployed(this.matic))) {
      delete this.matic._address;
      await this.deploy(this.matic, MyToken.bytecode, ["Matic Token", "MATIC", 18, this.web3.utils.toWei("10000000000")]);
    }
    ret.matic = this.matic._address;
    console.log("matic address: ", ret.matic);

    if (!(await deployed(this.usdt))) {
      delete this.usdt._address;
      await this.deploy(this.usdt, MyToken.bytecode, ["Tether USD", "USDT", 18, this.web3.utils.toWei("10000000000")]);
    }
    ret.usdt = this.usdt._address;
    console.log("usdt address: ", ret.usdt);

    console.log("=================================UNISWAP DEPLOY INFO=================================");
    console.log(JSON.stringify(ret, undefined, 2));
    console.log("=================================UNISWAP DEPLOY INFO=================================");
    return ret;
  }
  async approveToRouter(minAmount) {
    const { from, router02, web3, call } = this;
    const APPROVE_AMOUNT = web3.utils.toWei(minAmount ? String(minAmount * 100) : "10000000000");
    const approve = async (contract) => {
      let curAmount = parseFloat(web3.utils.fromWei(await call(contract, "allowance", from, [from, router02.address])));
      if (curAmount < parseFloat(minAmount || "1000000000")) {
        await this.send(contract, "approve", [router02.address, APPROVE_AMOUNT]);
      }
    };
    await approve(this.weth);
    await approve(this.matic);
    await approve(this.usdt);
  }
  async depositTenWeth(minAmount) {
    const { from, weth, web3, call } = this;
    const minAmountNum = parseFloat(web3.utils.fromWei(minAmount));
    let curAmout = parseFloat(web3.utils.fromWei(await call(weth, "balanceOf", from, [from])));
    let amount = minAmountNum > 10 ? minAmountNum : 10;
    if (minAmountNum > curAmout) {
      await this.send(weth, "deposit", [], web3.utils.toWei(String(amount - curAmout)));
    }
  }
  async transfer(token, to, amount) {
    await this.send(token, "transfer", [to, amount]);
  }
  async balanceOf(token, owner) {
    return await this.call(token, "balanceOf", this.from, [owner]);
  }
  async balanceOfReadable(token, owner) {
    return parseFloat(this.web3.utils.fromWei(await this.call(token, "balanceOf", this.from, [owner])));
  }
  async addLiquidity(token1, token2, amount1, amount2) {
    const pairAddress = await this.call(this.factory, "getPair", this.from, [token1.address, token2.address]);
    if (pairAddress == "0x0000000000000000000000000000000000000000") {
      if (token1.address == this.weth.address) {
        await this.depositTenWeth(amount1);
      }
      if (token2.address == this.weth.address) {
        await this.depositTenWeth(amount2);
      }
      await this.approveToRouter();
      const params = [token1.address, token2.address, amount1, amount2, 1, 1, this.from, parseInt(new Date().getTime() / 1000) + 600];
      await this.send(this.router02, "addLiquidity", params);
    } else {
      console.log(`pair ${token1.address} - ${token2.address} is existed!`);
    }
  }
  async swapExactTokensForTokens(token1, token2, amountIn) {
    const { from, router02 } = this;
    if (token1.address == this.weth.address) {
      await this.depositTenWeth(amountIn);
    }
    await this.approveToRouter();
    const params = [amountIn, "1", [token1.address, token2.address], from, parseInt(new Date().getTime() / 1000) + 600];
    await this.send(router02, "swapExactTokensForTokens", params);
  }
}

// example
// (async () => {
//   let url, privateKey;
//   url = "http://carina-eth-rpc.mybc.fun";
//   privateKey = "0xf78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769";

//   url = "http://127.0.0.1:8545";
//   privateKey = "0xf78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769";

//   const uniswap = new Uniswap({ url, privateKey });
//   await uniswap.deployContract();
//   await uniswap.addLiquidity(uniswap.weth, uniswap.matic, "1", "1333");
//   await uniswap.addLiquidity(uniswap.weth, uniswap.usdt, "1", "4000");
//   await uniswap.addLiquidity(uniswap.matic, uniswap.usdt, "1333", "4000");
//   await uniswap.swapExactTokensForTokens(uniswap.matic, uniswap.weth, "1333");
// })();
