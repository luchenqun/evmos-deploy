import util from "util";
import { exec } from "child_process";
import { bech32Chain, ETH } from "@quarix/address-converter";
import { createTxRaw } from '@quarix/proto'
import { signTypedData } from '@metamask/eth-sig-util'
import { arrayify, concat, splitSignature } from '@ethersproject/bytes'
import { Wallet } from '@ethersproject/wallet'
import { ethToQuarix } from '@quarix/address-converter'
import { generatePostBodyBroadcast } from '@quarix/provider'

export const ethToBech32 = (address, prefix) => {
  const ethAddress = ETH.decoder(address);
  const chain = bech32Chain(prefix.toUpperCase(), prefix);
  const data = chain.encoder(ethAddress);
  return data;
};

export const execPromis = util.promisify(exec);
export const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};
export const decodeReply = (reply) => {
  const stdout = reply.stdout;
  if (stdout) {
    const i = stdout.indexOf("code:");
    const j = stdout.indexOf("codespace:");
    const k = stdout.indexOf("txhash:");
    return (stdout.substring(i, j) + ", " + stdout.substring(k)).replace("\n", "");
  }
  return reply.stdout;
};

export const createTx = (createTxMsg, context, params, privateKey, signType = 'eip712') => {
  const msg = createTxMsg(context, params)
  const privateKeyBuf = Buffer.from(privateKey, 'hex')

  let signatureBytes
  if (signType === 'eip712') {
    const signature = signTypedData({
      privateKey: privateKeyBuf,
      data: msg.eipToSign,
      version: 'V4',
    })
    signatureBytes = Buffer.from(signature.replace('0x', ''), 'hex')
  } else {
    const wallet = new Wallet(privateKeyBuf)
    const dataToSign = `0x${Buffer.from(msg.signDirect.signBytes, 'base64').toString('hex')}`
    const signatureRaw = wallet._signingKey().signDigest(dataToSign)
    const splitedSignature = splitSignature(signatureRaw)
    signatureBytes = arrayify(concat([splitedSignature.r, splitedSignature.s]))
  }

  const rawTx = createTxRaw(msg.signDirect.body.toBinary(), msg.signDirect.authInfo.toBinary(), [signatureBytes])
  const txBytes = JSON.parse(generatePostBodyBroadcast(rawTx)).tx_bytes
  const txHexBytes = '0x' + Buffer.from(txBytes).toString('hex')
  return [txHexBytes, Buffer.from(txBytes).toString('base64')]
}

export const privateKeyToPublicKey = (privateKey, base64Encode = true) => {
  const wallet = new Wallet(Buffer.from(privateKey.replace('0x', ''), 'hex'))
  const compressedPublicKey = wallet._signingKey().compressedPublicKey.toLowerCase().replace('0x', '')
  if (base64Encode) {
    return Buffer.from(compressedPublicKey, 'hex').toString('base64')
  }
  return compressedPublicKey
}

export const privateKeyToQuarixAddress = (privateKey) => {
  const wallet = new Wallet(Buffer.from(privateKey.replace('0x', ''), 'hex'))
  return ethToQuarix(wallet.address)
}