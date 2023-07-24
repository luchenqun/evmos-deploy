import path from "path";
import { decodeReply, execPromis, sleep } from "../utils.js";

let run = async function () {
  try {
    // you should use cmd `node init.js --v=1 --s=true` to run 1 nodes
    const cwd = path.join(process.cwd(), "..");
    const granter = `qoe`;
    const grantee = `grantee`;
    const granterAddr = `quarix1qqqqhe5pnaq5qq39wqkn957aydnrm45sywg476`; // qoe address
    const granteeAddr = `quarix1llllqxkm0ruf2x4z3ncxe6um3zv2986sa8g3tu`;
    const fixed = `--from=${granter} --home=./nodes/node0/quarixd/ --keyring-backend=test --chain-id=quarix_8888888-1 --gas-prices 20000000000aqare --gas=21000 -y`;
    const fixedGrantee = fixed.replace(granter, grantee);
    let expiration = new Date();
    expiration.setMonth(expiration.getMonth() + 1);
    expiration = expiration.toISOString().slice(0, -5) + "Z";

    let cmd;
    let reply;
    {
      try {
        cmd = `./quarixd tx feegrant grant ${granter} ${granteeAddr} --spend-limit 1000000000000000000aqare --expiration ${expiration} ${fixed}`;
        reply = await execPromis(cmd, { cwd });
        console.log(cmd, "\n", decodeReply(reply));
      } catch (error) {}
    }

    {
      cmd = `./quarixd tx bank send ${grantee} ${granterAddr} 1000000000000000000aqrx --fee-granter ${granterAddr} ${fixedGrantee}`;
      reply = await execPromis(cmd, { cwd });
      console.log(cmd, "\n", decodeReply(reply));
    }

    // {
    //   cmd = `./quarixd tx feegrant grant ${granter} ${grantee} --period 3600 --period-limit 1000000000000000000aqare --expiration 2023-08-08T15:04:05Z ${fixed}`;
    //   reply = await execPromis(cmd, { cwd });
    //   console.log(cmd, "\n", decodeReply(reply));
    // }
  } catch (error) {
    console.log("error", error);
  }
};

run();
