import path from "path";
import { decodeReply, execPromis } from "../utils.js";

let run = async function () {
  try {
    const app = process.platform == "win32" ? `.\\evmosd` : "./evmosd";
    const cwd = path.join(process.cwd(), "..");
    const fixed = `--from=node0 --home=./nodes/node0/evmosd/ --keyring-backend=test --chain-id=evmos_20191205-1 -y`;
    let cmd;
    let reply;

    {
      cmd = `${app} tx crisis invariant-broken bank total-supply ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
