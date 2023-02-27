import util from "util";
import bech32 from "bech32";

import { exec } from "child_process";

import { isValidChecksumAddress, stripHexPrefix, toChecksumAddress } from "crypto-addr-codec";

function makeBech32Encoder(prefix) {
  return (data) => bech32.encode(prefix, bech32.toWords(data));
}

function makeBech32Decoder(currentPrefix) {
  return (data) => {
    const { prefix, words } = bech32.decode(data);
    if (prefix !== currentPrefix) {
      throw Error("Unrecognised address format");
    }
    return Buffer.from(bech32.fromWords(words));
  };
}

const bech32Chain = (name, prefix) => ({
  decoder: makeBech32Decoder(prefix),
  encoder: makeBech32Encoder(prefix),
  name,
});

function makeChecksummedHexEncoder(chainId) {
  return (data) => toChecksumAddress(data.toString("hex"), chainId || null);
}

function makeChecksummedHexDecoder(chainId) {
  return (data) => {
    const stripped = stripHexPrefix(data);
    if (!isValidChecksumAddress(data, chainId || null) && stripped !== stripped.toLowerCase() && stripped !== stripped.toUpperCase()) {
      throw Error("Invalid address checksum");
    }
    return Buffer.from(stripHexPrefix(data), "hex");
  };
}
const hexChecksumChain = (name, chainId) => ({
  decoder: makeChecksummedHexDecoder(chainId),
  encoder: makeChecksummedHexEncoder(chainId),
  name,
});

export const ETH = hexChecksumChain("ETH");

export const bech32ToEth = (address) => {
  const decode = bech32.decode(address);
  const chain = bech32Chain(decode.prefix.toUpperCase(), decode.prefix);
  const data = chain.decoder(address);
  return ETH.encoder(data);
};

export const ethToBech32 = (address, prefix) => {
  const ethAddress = ETH.decoder(address);
  const chain = bech32Chain(prefix.toUpperCase(), prefix);
  const data = chain.encoder(ethAddress);
  return data;
};

export const bech32Prefix = (address) => {
  const decode = bech32.decode(address);
  return decode.prefix;
};

export const bech32BasePrefix = (address) => {
  const decode = bech32.decode(address);
  return decode.prefix.replace("valoper", "").replace("valcons", "");
};

export const bech32BaseAddress = (address) => {
  const decode = bech32.decode(address);
  return bech32.encode(decode.prefix.replace("valoper", "").replace("valcons", ""), decode.words);
};

export const ben32Encode = (address, prefix) => {
  const decode = bech32.decode(address);
  return bech32.encode(prefix, decode.words);
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
