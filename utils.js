import util from "util";
import { exec } from "child_process";
import { bech32Chain, ETH } from "@quarix/address-converter";

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
