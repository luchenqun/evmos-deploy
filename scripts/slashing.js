import path from "path";
import { decodeReply, execPromis } from "../utils.js";

let run = async function () {
  try {
    const cwd = path.join(process.cwd(), "..");

    const from = `node3`;
    const fixed = `--from=${from} --home=./nodes/node3/evmosd/ --keyring-backend=test --chain-id=evmos_20191205-1 -y`;
    let cmd;
    let reply;

    {
      // you should use cmd `node init.js --v=4 --s=true` to run 4 nodes, then kill fourth node wait the validator status become BOND_STATUS_UNBONDING and restart fourth node
      cmd = `./evmosd tx slashing unjail ${fixed}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }
  } catch (error) {
    console.log("error", error);
  }
};

run();
