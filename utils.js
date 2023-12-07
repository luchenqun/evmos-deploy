import util from "util";
import crypto from "crypto";
import { exec } from "child_process";

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

export const privKeyToBurrowAddres = (privKey, isBase64 = true) => {
  if (isBase64) {
    privKey = Buffer.from(privKey, "base64").toString("hex");
  }
  const publicKey = privKey.substring(64, 128);
  const digest = crypto.createHash("sha256").update(Buffer.from(publicKey, "hex")).digest("hex");
  return digest.toLowerCase().substring(0, 40);
};
