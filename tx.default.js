import { ethers } from "ethers";
import fs from "fs-extra";
import { createTxMsgGrantNormalGasWaiver } from "@quarix/transactions";
import { createTxRaw, createBasicGasAllowance } from "@quarix/proto";
import { signTypedData } from "@metamask/eth-sig-util";
import { App, Tendermint, CosmosTxV1Beta1BroadcastMode, generatePostBodyBroadcast } from "@quarix/provider";
import { arrayify, concat, splitSignature } from "@ethersproject/bytes";
import { Wallet } from "@ethersproject/wallet";
import { ethToQuarix } from "@quarix/address-converter";
import { Timestamp } from "@bufbuild/protobuf";

const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

const deploy = async (privateKey, provider, abi, bytecode, params) => {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);
    const signer = wallet.connect(provider);
    const compiledContract = new ethers.ContractFactory(abi, bytecode, signer);
    const deployedContract = await compiledContract.deploy(params);
    return deployedContract;
  } catch (error) {
    return Promise.reject(error);
  }
};

const createTx = (createTxMsg, context, params, privateKey, signType = "eip712") => {
  const msg = createTxMsg(context, params);
  const privateKeyBuf = Buffer.from(privateKey, "hex");

  let signatureBytes;
  if (signType === "eip712") {
    const signature = signTypedData({
      privateKey: privateKeyBuf,
      data: msg.eipToSign,
      version: "V4",
    });
    signatureBytes = Buffer.from(signature.replace("0x", ""), "hex");
  } else {
    const wallet = new Wallet(privateKeyBuf);
    const dataToSign = `0x${Buffer.from(msg.signDirect.signBytes, "base64").toString("hex")}`;
    const signatureRaw = wallet._signingKey().signDigest(dataToSign);
    const splitedSignature = splitSignature(signatureRaw);
    signatureBytes = arrayify(concat([splitedSignature.r, splitedSignature.s]));
  }

  const rawTx = createTxRaw(msg.signDirect.body.toBinary(), msg.signDirect.authInfo.toBinary(), [signatureBytes]);
  const txBytes = JSON.parse(generatePostBodyBroadcast(rawTx)).tx_bytes;
  const txHexBytes = "0x" + Buffer.from(txBytes).toString("hex");
  return [txHexBytes, Buffer.from(txBytes).toString("base64")];
};

const privateKeyToPublicKey = (privateKey, base64Encode = true) => {
  const wallet = new Wallet(Buffer.from(privateKey.replace("0x", ""), "hex"));
  const compressedPublicKey = wallet._signingKey().compressedPublicKey.toLowerCase().replace("0x", "");
  if (base64Encode) {
    return Buffer.from(compressedPublicKey, "hex").toString("base64");
  }
  return compressedPublicKey;
};

const privateKeyToQuarixAddress = (privateKey) => {
  const wallet = new Wallet(Buffer.from(privateKey.replace("0x", ""), "hex"));
  return ethToQuarix(wallet.address);
};

// Implement the logic you need here
export const main = async () => {
  try {
    const simpleStorageAbi = [
      { inputs: [], name: "get", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
      { inputs: [{ internalType: "uint256", name: "x", type: "uint256" }], name: "set", outputs: [], stateMutability: "nonpayable", type: "function" },
    ];
    const simpleStorageByteCode = "608060405260ff60005534801561001557600080fd5b50610150806100256000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c806360fe47b11461003b5780636d4ce63c14610057575b600080fd5b610055600480360381019061005091906100c3565b610075565b005b61005f61007f565b60405161006c91906100ff565b60405180910390f35b8060008190555050565b60008054905090565b600080fd5b6000819050919050565b6100a08161008d565b81146100ab57600080fd5b50565b6000813590506100bd81610097565b92915050565b6000602082840312156100d9576100d8610088565b5b60006100e7848285016100ae565b91505092915050565b6100f98161008d565b82525050565b600060208201905061011460008301846100f0565b9291505056fea2646970667358221220d8334243aecf8612e8d33a7ce35eb34a931b1985cf04444cf971161854900f6d64736f6c63430008120033";
    const privateKeyQoe = "f78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769"; // 0x00000be6819f41400225702d32d3dd23663dd690;
    const baseUrl = "http://127.0.0.1";
    let ethRpc = ``;
    let api = ``;
    let rpc = ``;

    {
      let config = await fs.readJSON("./config.json");
      ethRpc = `${baseUrl}:${config["app"]["port"]["json-rpc.address"]}`;
      api = `${baseUrl}:${config["app"]["port"]["api.address"]}`;
      rpc = `${baseUrl}:${config["tendermint"]["port"]["rpc.laddr"]}`;
    }

    const provider = new ethers.JsonRpcProvider(ethRpc);
    const tdm = new Tendermint({ baseURL: rpc });
    const app = new App({ baseURL: api });

    // 检查以太坊rpc是否可用了
    {
      console.log("\nWait for 30s the EVM RPC HTTP server start...\n");
      let tryCount = 60;
      while (tryCount > 0) {
        try {
          await provider.getBlock();
          break;
        } catch (error) {
          tryCount--;
        }
        await sleep(500);
        if (tryCount < 0) {
          throw "Can't connect " + ethRpc;
        }
        console.log(`Wait ${tryCount * 0.5}s left for check`);
      }

      console.log("\nThe EVM RPC HTTP server start success!!!\n");
    }

    // 部署合约
    let contractAddress;
    {
      const contract = await deploy(privateKeyQoe, provider, simpleStorageAbi, simpleStorageByteCode, []);
      contractAddress = await contract.getAddress();
      console.log(`deploy simple storage contract success, address = `, contractAddress);
      await sleep(2000);
    }

    // 发起一个gaswaiver交易
    {
      const chain = {
        chainId: 8888888,
        cosmosChainId: "quarix_8888888-1",
      };
      // convert mnemonic to private key
      let privateKey = privateKeyQoe;

      let sender = {
        accountAddress: privateKeyToQuarixAddress(privateKey),
        sequence: "0",
        accountNumber: "0",
        pubkey: privateKeyToPublicKey(privateKey),
      };

      const fee = {
        amount: "4000000000000000000",
        denom: "aqare",
        gas: "2000000",
      };

      const memo = "quarixjs test";

      // Update params based on the message you want to send
      const params = {
        granter: privateKeyToQuarixAddress(privateKey),
        grantee: contractAddress,
        allowance: createBasicGasAllowance("aqare", "10000000000000000000", Timestamp.fromDate(new Date("2028-01-01"))),
      };

      const account = await app.auth.account(sender.accountAddress);
      sender.sequence = account.account.base_account.sequence;
      sender.accountNumber = account.account.base_account.account_number;

      // use eip712 sign msg
      const context = { chain, sender, fee, memo };
      const [_, txBytesBase64] = createTx(createTxMsgGrantNormalGasWaiver, context, params, privateKey, "eip712");
      const result = await app.tx.broadcastTx({ tx_bytes: txBytesBase64, mode: CosmosTxV1Beta1BroadcastMode.BROADCAST_MODE_BLOCK });
      console.log("grant normal gas waiver success");
      // console.log(JSON.stringify(result, undefined, 2));
    }
  } catch (error) {
    console.log("error:", error);
  }
};
