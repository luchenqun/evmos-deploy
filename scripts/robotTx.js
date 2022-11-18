import { Wallet } from "@ethersproject/wallet";
import signUtil from "@metamask/eth-sig-util";
import { ethToEvmos } from "@tharsis/address-converter";
import { generatePostBodyBroadcast } from "@tharsis/provider";
import { createMessageSend, createTxMsgDelegate, createTxMsgUndelegate, createTxMsgWithdrawDelegatorReward, createTxMsgVote, createTxRawEIP712, signatureToWeb3Extension } from "@tharsis/transactions";
import bech32 from "bech32-buffer";
import fs from "fs-extra";
import Web3 from "web3";
import API from "../api/index.js";
import Uniswap from "./uniswap.js";
import gov from "../msg/gov.js";
import slashing from "../msg/slashing.js";

const randomInt = (min, max) => ((Math.random() * (max - min + 1)) | 0) + min;

const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

const bech32Encode = (prefix, address) => {
  return bech32.encode(prefix, Uint8Array.from(Buffer.from(address.replace("0x", ""), "hex")));
};

const toWei = (amount) => {
  return Web3.utils.toWei(String(amount));
};

const fromWei = (amount) => {
  return parseFloat(Web3.utils.fromWei(amount));
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

  return count > 1 ? shuffled.slice(min) : shuffled.slice(min)[0];
};

const accountInfo = async (node) => {
  let wallet;
  if (node.length >= 64) {
    wallet = new Wallet(node);
  } else {
    const keySeed = await fs.readJSON(`../nodes/${node}/evmosd/key_seed.json`);
    wallet = Wallet.fromMnemonic(keySeed.secret);
  }
  const privateKey = wallet._signingKey().privateKey.toLowerCase().replace("0x", "");
  const address = wallet.address;
  const evmosAddress = ethToEvmos(address);
  const validatorAddress = bech32Encode("evmosvaloper", address);
  const publicKey = wallet._signingKey().publicKey;
  const compressedPublicKey = wallet._signingKey().compressedPublicKey;
  return { privateKey, publicKey, compressedPublicKey, address, evmosAddress, validatorAddress };
};

(async () => {
  let config = {};
  let uniswap = undefined;
  let validatorPrivateKeys = [];
  let commonPrivateKeys = [];
  let allPrivateKeys = [];
  // init config
  {
    try {
      config = await fs.readJSON("./robotTx.json");
    } catch (error) {
      config = {};
    }

    if (!config.chain) config.chain = {};
    if (!config.chain.api) config.chain.api = "http://127.0.0.1:1317";
    if (!config.chain.rpc) config.chain.rpc = "http://127.0.0.1:26657";
    if (!config.chain.ethRpc) config.chain.ethRpc = "http://127.0.0.1:8545";

    if (!Array.isArray(config.validatorPrivateKeys) || config.validatorPrivateKeys.length == 0) {
      const files = await fs.readdir("../nodes");
      for (const node of files) {
        if (node.startsWith("node")) {
          const { privateKey } = await accountInfo(node);
          validatorPrivateKeys.push(privateKey);
        }
      }
    } else {
      validatorPrivateKeys = config.validatorAddress;
    }

    if (!Array.isArray(validatorPrivateKeys) || validatorPrivateKeys.length == 0) {
      console.log("Error: No Validator PrivateKeys");
      return;
    }

    if (!config.uniswap) config.uniswap = {};
    if (!config.uniswap.privateKey) config.uniswap.privateKey = validatorPrivateKeys[0];

    if (!Array.isArray(config.privateKeys) || config.privateKeys.length == 0) {
      commonPrivateKeys = [
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
    } else {
      commonPrivateKeys = config.privateKeys;
    }

    allPrivateKeys = validatorPrivateKeys.concat(commonPrivateKeys);
  }

  // init uniswap
  {
    uniswap = new Uniswap(Object.assign({ url: config.chain.ethRpc }, config.uniswap));
    const contractCfg = await uniswap.deployCheckContract();
    await uniswap.addLiquidity(uniswap.weth, uniswap.matic, toWei("10"), toWei("13330"));
    await uniswap.addLiquidity(uniswap.weth, uniswap.usdt, toWei("10"), toWei("40000"));
    await uniswap.addLiquidity(uniswap.matic, uniswap.usdt, toWei("133300"), toWei("400000"));
    Object.assign(config.uniswap, contractCfg);
    console.log(config.uniswap);
  }

  await fs.outputJSON("./robotTx.json", config, { spaces: 2 });

  const api = new API({ rpcHttp: config.chain.rpc, apiHttp: config.chain.api });
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
    let extension = signatureToWeb3Extension(chain, sender, signature);
    let rawTx = createTxRawEIP712(msg.legacyAmino.body, msg.legacyAmino.authInfo, extension);
    let txBytes = JSON.parse(generatePostBodyBroadcast(rawTx)).tx_bytes;
    return "0x" + Buffer.from(txBytes).toString("hex");
  };

  const bankBalanceReadable = async (address, denom) => {
    const data = await api.bankBalance(address, denom);
    return parseFloat(Web3.utils.fromWei(data.balance.amount));
  };

  const tranfer = async (privateKey, destinationAddress, denom, amount) => {
    const memo = "send staking denom by robot";
    const params = {
      destinationAddress,
      amount,
      denom,
    };
    const data = await txHexBytes(privateKey, chain, fee, memo, createMessageSend, params);
    return api.txCommit(data);
  };

  const delegate = async (privateKey, validatorAddress, amount) => {
    const memo = "delegate by robot";
    const params = {
      validatorAddress,
      amount,
      denom: stakingDenom,
    };
    const data = await txHexBytes(privateKey, chain, fee, memo, createTxMsgDelegate, params);
    return api.txCommit(data);
  };

  const undelegate = async (privateKey, validatorAddress, amount) => {
    const memo = "undelegate by robot";
    const params = {
      validatorAddress,
      amount,
      denom: stakingDenom,
    };
    const data = await txHexBytes(privateKey, chain, fee, memo, createTxMsgUndelegate, params);
    return api.txCommit(data);
  };

  const withdrawDelegatorReward = async (privateKey, validatorAddress) => {
    const memo = "withdraw delegator reward by robot";
    const params = {
      validatorAddress,
    };
    const data = await txHexBytes(privateKey, chain, fee, memo, createTxMsgWithdrawDelegatorReward, params);
    return api.txCommit(data);
  };

  const textProposal = async (privateKey, title, description, amount) => {
    const { evmosAddress } = await accountInfo(privateKey);
    const memo = "gov text proposal test by robot";
    const params = {
      content: {
        type: "Text",
        value: {
          title,
          description,
        },
      },
      initial_deposit: [
        {
          denom: stakingDenom,
          amount,
        },
      ],
      proposer: evmosAddress,
    };
    const data = await txHexBytes(privateKey, chain, fee, memo, gov.createTxMsgTextProposal, params);
    return api.txCommit(data);
  };

  const vote = async (privateKey, proposalId, option) => {
    const memo = "msgVote by robot";
    const params = {
      proposalId,
      option,
    };
    const data = await txHexBytes(privateKey, chain, fee, memo, createTxMsgVote, params);
    return api.txCommit(data);
  };

  const unjail = async (privateKey, address) => {
    const memo = "unjail test by robot";
    const params = {
      address,
    };
    const data = await txHexBytes(privateKey, chain, fee, memo, slashing.createTxMsgUnjail, params);
    return api.txCommit(data);
  };

  /*--------------------------- for robot tx ---------------------------*/
  // Start up fund
  for (const privateKey of commonPrivateKeys) {
    const { address, evmosAddress } = await accountInfo(privateKey);

    // transfer native token
    const denoms = ["aevmos", stakingDenom];
    for (const denom of denoms) {
      const amount = await bankBalanceReadable(evmosAddress, denom);
      if (amount < 10) {
        await tranfer(config.uniswap.privateKey, evmosAddress, denom, toWei(100));
      }
    }

    // transfer erc20 token
    const tokens = [uniswap.matic, uniswap.usdt];
    for (const token of tokens) {
      const amount = await uniswap.balanceOfReadable(token, address);
      if (amount < 10) {
        await uniswap.transfer(token, address, toWei(100));
      }
    }
  }

  let loading = false;
  setInterval(async () => {
    if (loading) return;
    loading = true;

    const [fromKey, toKey] = getRandomArrayElements(commonPrivateKeys, 2);
    const toAccount = await accountInfo(toKey);
    const randWei = toWei(String(Math.random().toFixed(2)));
    const denom = getRandomArrayElements(["aevmos", stakingDenom], 1);
    const uniswap = new Uniswap(Object.assign(JSON.parse(JSON.stringify(config.uniswap)), { privateKey: fromKey }));
    const tokens = [uniswap.matic, uniswap.usdt];

    try {
      const randNumber = parseInt(Math.random() * 3) + 1;
      if (randNumber == 1) {
        const [token1, token2] = getRandomArrayElements(tokens, 2);
        await uniswap.swapExactTokensForTokens(token1, token2, randWei);
      } else if (randNumber == 2) {
        const token = getRandomArrayElements(tokens, 1);
        await uniswap.transfer(token, toAccount.address, randWei);
      } else {
        await tranfer(fromKey, toAccount.evmosAddress, denom, randWei);
      }
    } catch (error) {
      console.log(error);
    }
    loading = false;
  }, 1000); // 1s

  setInterval(async () => {
    while (loading) {
      await sleep(100);
    }
    loading = true;
    try {
      const randWei = toWei(String(Math.random().toFixed(2)));
      for (const privateKey of commonPrivateKeys) {
        const { validatorAddress } = await accountInfo(getRandomArrayElements(validatorPrivateKeys, 1));
        await delegate(privateKey, validatorAddress, randWei);
        for (const validatorPrivateKey of validatorPrivateKeys) {
          const { validatorAddress } = await accountInfo(validatorPrivateKey);
          await withdrawDelegatorReward(privateKey, validatorAddress);
        }
      }

      for (const privateKey of validatorPrivateKeys) {
        const { evmosAddress, validatorAddress } = await accountInfo(privateKey);
        const amount = await bankBalanceReadable(evmosAddress, stakingDenom);
        if (amount > 100) {
          await delegate(privateKey, validatorAddress, toWei(amount - 100));
          await withdrawDelegatorReward(privateKey, validatorAddress);
        }
      }
    } catch (error) {}
    loading = false;
  }, 1000 * 60 * 10); // 10 min

  setInterval(async () => {
    while (loading) {
      await sleep(100);
    }
    loading = true;
    try {
      for (const privateKey of allPrivateKeys) {
        const { evmosAddress } = await accountInfo(privateKey);
        const data = await api.delegations(evmosAddress);
        for (const delegation of data.delegation_responses) {
          await undelegate(privateKey, delegation.delegation.validator_address, delegation.balance.amount);
        }
      }
    } catch (error) {}
    loading = false;
  }, 1000 * 60 * 60); // 1h

  setInterval(async () => {
    while (loading) {
      await sleep(100);
    }
    loading = true;
    try {
      for (const privateKey of validatorPrivateKeys) {
        const { validatorAddress } = await accountInfo(privateKey);
        await unjail(privateKey, validatorAddress);
      }
    } catch (error) {}
    loading = false;
  }, 1000 * 60 * 60); // 1h

  const proposal = async (first) => {
    while (loading) {
      await sleep(100);
    }
    loading = true;
    try {
      const privateKey = getRandomArrayElements(validatorPrivateKeys, 1);
      const data = await api.proposals(0, 1);
      const total = parseInt(data.pagination.total);
      if (total > 0 && first) {
        loading = false;
        return; // 如果已经有提案了，立即提交的提案就不要执行了
      }
      const proposalId = String(total + 1);
      await textProposal(privateKey, "Proposal " + proposalId, "I Love This World", "10000000");
      const option = getRandomArrayElements(["1", "2", "3"], 1);
      for (const privateKey of allPrivateKeys) {
        if (Math.random() >= 0.7) {
          const curOption = getRandomArrayElements(["1", "2", "3"], 1);
          await vote(privateKey, proposalId, curOption);
        } else {
          await vote(privateKey, proposalId, option);
        }
      }
    } catch (error) {}
    loading = false;
  };

  proposal(true); // 启动立即执行一遍
  setInterval(proposal, 1000 * 60 * 60 * 8, false);
})();
