import { Wallet } from "@ethersproject/wallet";
import signUtil from "@metamask/eth-sig-util";
import { ethToEvmos } from "@tharsis/address-converter";
import { generatePostBodyBroadcast } from "@tharsis/provider";
import { createMessageSend, createTxMsgDelegate, createTxMsgWithdrawDelegatorReward, createTxRawEIP712, signatureToWeb3Extension } from "@tharsis/transactions";
import bech32 from "bech32-buffer";
import unit from "ethjs-unit";
import fs from "fs-extra";
import Web3 from "web3";
import API from "../api/index.js";

const bech32Encode = (prefix, address) => {
  return bech32.encode(prefix, Uint8Array.from(Buffer.from(address.replace("0x", ""), "hex")));
};

const toAevmos = (evmos) => {
  return unit.toWei(evmos, "ether").toString();
};

const getRandomArrayElements = (arr, count) => {
  var shuffled = arr.slice(0),
    i = arr.length,
    min = i - count,
    temp,
    index;
  while (i-- > min) {
    index = Math.floor((i + 1) * Math.random());
    temp = shuffled[index];
    shuffled[index] = shuffled[i];
    shuffled[i] = temp;
  }
  return shuffled.slice(min);
};

const nodeKey = async (node) => {
  const keySeed = await fs.readJSON(`../nodes/${node}/evmosd/key_seed.json`);
  const wallet = Wallet.fromMnemonic(keySeed.secret);
  const privateKey = wallet._signingKey().privateKey.toLowerCase().replace("0x", "");
  const address = wallet.address;
  const evmosAddress = ethToEvmos(address);
  const publicKey = wallet._signingKey().publicKey;
  const compressedPublicKey = wallet._signingKey().compressedPublicKey;
  return { privateKey, publicKey, compressedPublicKey, address, evmosAddress };
};

(async () => {
  const hexPrivateKey = "0xf78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769";
  const endpoint = "http://127.0.0.1:8545";
  const apiUrl = "http://127.0.0.1:1317";
  const rpcUrl = "http://127.0.0.1:26657";
  // const endpoint = "http://carina-eth-rpc.mybc.fun";
  // const apiUrl = "http://carina-api.mybc.fun";
  // const rpcUrl = "http://carina-rpc.mybc.fun";
  const router02Address = "0xb4936c57f5b6B5a247aD6089C56064DF98fFf470";
  const wethAddress = "0x546bc6E008689577C69C42b9C1f6b4C923f59B5d";
  const maticAddress = "0x4BD9051a87E8d731E452eD84D22AA6E33b608E25";
  const usdtAddress = "0x67a2de7C64F04C1c8E894674acB2A2F99710bDDE";

  const UniswapV2Router02 = JSON.parse(await fs.readFile(new URL("./v2-periphery/UniswapV2Router02.json", import.meta.url)));
  const MyToken = JSON.parse(await fs.readFile(new URL("./v2-periphery/WETH9.json", import.meta.url)));

  const web3 = new Web3(new Web3.providers.HttpProvider(endpoint, { timeout: 1000 * 30 }));
  const api = new API(apiUrl, rpcUrl);
  const router02 = new web3.eth.Contract(UniswapV2Router02.abi, router02Address);
  const weth = new web3.eth.Contract(MyToken.abi, wethAddress);
  const matic = new web3.eth.Contract(MyToken.abi, maticAddress);
  const usdt = new web3.eth.Contract(MyToken.abi, usdtAddress);

  const account = web3.eth.accounts.privateKeyToAccount(hexPrivateKey);
  const privateKeys = [
    "0xf78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769", // 0x00000be6819f41400225702d32d3dd23663dd690
    "0x95e06fa1a8411d7f6693f486f0f450b122c58feadbcee43fbd02e13da59395d5", // 0x1111102dd32160b064f2a512cdef74bfdb6a9f96
    "0x322673135bc119c82300450aed4f29373c06926f02a03f15d31cac3db1ee7716", // 0x2222207b1f7b8d37566d9a2778732451dbfbc5d0
    "0x09100ba7616fcd062a5e507ead94c0269ab32f1a46fe0ec80056188976020f71", // 0x33333bffc67dd05a5644b02897ac245baed69040
    "0x5352cfb603f3755c71250f24aa1291e85dbc73a01e9c91e7568cd081b0be04db", // 0x4444434e38e74c3e692704e4ba275dae810b6392
    "0xf3d9247d078302fd876462e2036e05a35af8ca6124ba1a8fd82fc3ae89b2959d", // 0x55555d6c72886e5500a9410ca15d08a16011ed95
    "0x39cfe0662cdede90094bf079b339e09e316b1cfe02e92d56a4d6d95586378e38", // 0x666668f2a2e38e93089b6e6a2e37c854bb6db7de
    "0xa78e6fe4fe2c66a594fdd639b39bd0064d7cefbbebf43b57de153392b0f4e30c", // 0x77777295eee9b2b4da75ac0f2d3b14b20b5883da
    "0x7df4c6f61a6b83b3f8e0eb299033d016e077a51162427c1786c53a18cc3b5bd1", // 0x8888834da5fa77577e8a8e4479f51f7210a5f95e
    "0x75e4125b9c2bb9f203c637d9f4312471b741b6ac15760e36c18e437a035272d2", // 0x999992ab64f24f09aaa225b85556a48ab52ae7c6
    "0x0605636f02e29f93405e71c6923480d1c25cba3d0b102032947593b06c541c82", // 0xaaaaaccef17c7a366bd61aeef9a9d2cc5026d40a
    "0x318dedc70c1bf4942c0e4a885f2f059833912db4bc145216f23fceb492eff9d3", // 0xbbbbbd5877dc1891f273eb49abedc0e8fcc1fb1c
    "0x0c27877900e26e16061d04730addcd2aa5dbcb7e1e1721a5f9d7300a3beece3d", // 0xccccc39a07ebcc6f302edc2157604d1d86baba48
    "0x41601b4909dbe65ab4528ebdd691aa1c50d1e26ab8b87154e999b2691af9ad20", // 0xddddd5a2836f327c397f3e119ee77ebd00dd567b
    "0x03012804714caf41d1fa61c3677699b3dfa08adb9d89075cecd2eb4649669c19", // 0xeeeee5d1d01f99d760f9da356e683cc1f29f2f81
    "0xb5383875512d64281acfb81cc37a95b0ddc00b235a3aa60cf8b4be25a3ba8fe5", // 0xfffff01adb78f8951aa28cf06ceb9b8898a29f50
  ];

  const chainId = await web3.eth.getChainId();
  const gasPrice = await web3.eth.getGasPrice();
  const gas = 5000000;
  const APPROVE_AMOUNT = web3.utils.toWei("1000000000000000000000000000000000000000000");

  const txHexBytes = async (privateKeyHex, chain, fee, memo, createMessage, params) => {
    const privateKey = Buffer.from(privateKeyHex.replace("0x", ""), "hex");
    const wallet = new Wallet(privateKey);
    const address = ethToEvmos(wallet.address);
    const account = await api.authAccount(address);
    const sender = {
      accountAddress: address,
      sequence: account.account.base_account.sequence,
      accountNumber: account.account.base_account.account_number,
      pubkey: Buffer.from(wallet._signingKey().compressedPublicKey.replace("0x", ""), "hex").toString("base64"),
    };

    const msg = createMessage(chain, sender, fee, memo, params);
    const signature = signUtil.signTypedData({
      privateKey,
      data: msg.eipToSign,
      version: "V4",
    });

    // The chain and sender objects are the same as the previous example
    let extension = signatureToWeb3Extension(chain, sender, signature);

    // Create the txRaw
    let rawTx = createTxRawEIP712(msg.legacyAmino.body, msg.legacyAmino.authInfo, extension);
    let txBytes = JSON.parse(generatePostBodyBroadcast(rawTx)).tx_bytes;
    // console.log(JSON.stringify(msg.eipToSign.message.msgs, undefined, 2));

    return "0x" + Buffer.from(txBytes).toString("hex");
  };

  async function sendTransaction(account, data, to, value) {
    const from = account.address;
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

  async function send(account, contract, method, args, value) {
    const data = contract.methods[method].apply(contract.methods, args || []).encodeABI();
    await sendTransaction(account, data, contract.options.address, value);
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

  const genesis = await api.genesis();
  const chain = {
    chainId: parseInt(genesis.genesis.chain_id.split("_")[1].split("-")[0]),
    cosmosChainId: genesis.genesis.chain_id,
  };

  const fee = {
    amount: "10000000",
    denom: "aevmos",
    gas: "2000000000",
  };

  const staking = await api.stakingParams();
  const stakingDenom = staking.params.bond_denom;

  {
    for (const privateKey of privateKeys) {
      const curAccount = web3.eth.accounts.privateKeyToAccount(privateKey);
      const to = curAccount.address;
      await sendTransaction(account, "0x", to, web3.utils.toWei("100"));

      {
        const memo = "send staking denom by robot";
        const params = {
          destinationAddress: bech32Encode("evmos", to),
          amount: toAevmos(10),
          denom: stakingDenom,
        };
        const data = await txHexBytes(hexPrivateKey, chain, fee, memo, createMessageSend, params);
        await api.txCommit(data);
      }

      {
        const memo = "delegate by robot";
        const { address } = await nodeKey("node0");
        const params = {
          validatorAddress: bech32Encode("evmosvaloper", address),
          amount: toAevmos(10),
          denom: stakingDenom,
        };
        const data = await txHexBytes(privateKey, chain, fee, memo, createTxMsgDelegate, params);
        await api.txCommit(data);
      }

      await send(account, matic, "transfer", [to, web3.utils.toWei("1000000")]);
      await send(account, usdt, "transfer", [to, web3.utils.toWei("1000000")]);
      await send(curAccount, weth, "deposit", [], web3.utils.toWei("90"));
      await send(curAccount, weth, "approve", [router02._address, APPROVE_AMOUNT]);
      await send(curAccount, matic, "approve", [router02._address, APPROVE_AMOUNT]);
      await send(curAccount, usdt, "approve", [router02._address, APPROVE_AMOUNT]);
    }
  }

  let loading = false;
  setInterval(async () => {
    if (loading) return;
    loading = true;
    const [fromKey, toKey] = getRandomArrayElements(privateKeys, 2);
    const fromAccount = web3.eth.accounts.privateKeyToAccount(fromKey);
    const toAccount = web3.eth.accounts.privateKeyToAccount(toKey);
    const randWei = web3.utils.toWei(String((Math.random() / 10).toFixed(10)));
    const randNumber = parseInt(Math.random() * 4) + 1;
    try {
      if (randNumber == 1) {
        send(fromAccount, router02, "swapExactTokensForTokens", [randWei, "1", getRandomArrayElements([weth._address, matic._address, usdt._address], 2), fromAccount.address, parseInt(new Date().getTime() / 1000) + 600]);
      }
      if (randNumber == 2) {
        send(fromAccount, weth, "deposit", [], randWei);
      }
      if (randNumber == 3) {
        send(fromAccount, getRandomArrayElements([weth, matic, usdt], 1)[0], "transfer", [toAccount.address, randWei]);
      }
      if (randNumber == 4) {
        sendTransaction(fromAccount, "0x", toAccount.address, randWei);
      }
    } catch (error) {
      console.log(error);
    }

    loading = false;
  }, 1000);

  setInterval(async () => {
    if (loading) return;
    loading = true;

    try {
      for (const privateKey of privateKeys) {
        const memo = "withdraw delegator reward by robot";
        const { address } = await nodeKey("node0");
        const params = {
          validatorAddress: bech32Encode("evmosvaloper", address),
        };
        const data = await txHexBytes(privateKey, chain, fee, memo, createTxMsgWithdrawDelegatorReward, params);
        api.txCommit(data);
      }
    } catch (error) {
      console.log(error);
    }

    loading = false;
  }, 1000 * 5 * 60);
})();
