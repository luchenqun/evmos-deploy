import util from "util";
import { exec } from "child_process";
import path from "path";
const execPromis = util.promisify(exec);
const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

const decodeReply = (reply) => {
  const stdout = reply.stdout;
  if (stdout) {
    const i = stdout.indexOf("code:");
    const j = stdout.indexOf("codespace:");
    const k = stdout.indexOf("txhash:");
    return (stdout.substring(i, j) + ", " + stdout.substring(k)).replace("\n", "");
  }
  return reply.stdout;
};

let run = async function () {
  try {
    const cwd = path.join(process.cwd(), "..");
    const fixed = `--from=evmos1hajh6rhhkjqkwet6wqld3lgx8ur4y3khjuxkxh --home=./nodes/node0/evmosd/ --keyring-backend=test --chain-id=evmos_20191205-1 -y`;
    let cmd;
    let reply;

    {
      cmd = `./evmosd tx crisis invariant-broken bank total-supply ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
